import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { addUtcDays, startOfUtcDay, toDateInputValue } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

/**
 * Builds a future range that starts on a Monday, so short ranges always contain
 * working days, and that never straddles a calendar year boundary.
 */
function futureRange(startInDays: number, lengthDays: number): { start: string; end: string; year: number } {
  let start = addUtcDays(startOfUtcDay(new Date()), startInDays);
  if (start.getUTCMonth() === 11) start = addUtcDays(start, 21);
  if (start.getUTCDay() === 0) start = addUtcDays(start, 1);
  if (start.getUTCDay() === 6) start = addUtcDays(start, 2);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(addUtcDays(start, lengthDays - 1)),
    year: start.getUTCFullYear(),
  };
}

interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  annualQuota: number;
  minDaysNotice: number;
  isActive: boolean;
}

interface LeaveRequestRow {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  managerStage: string;
  hrStage: string;
  leaveType: { code: string };
  employee: { employeeCode: string };
}

interface BalanceRow {
  leaveType: { code: string };
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

/** A balance row as returned for HR, including the fields needed to adjust it. */
interface ManageableBalance extends BalanceRow {
  id: string;
  year: number;
  carriedForward: number;
  leaveType: { id: string; code: string };
}

async function leaveTypeByCode(session: LoginResult, code: string): Promise<LeaveTypeRow> {
  const response = await request(app)
    .get(`/api/v1/leave-types?search=${code}&limit=50`)
    .set(bearer(session))
    .expect(200);

  const match = (response.body.data as LeaveTypeRow[]).find((row) => row.code === code);
  if (!match) throw new Error(`Seeded leave type ${code} was not found`);
  return match;
}

async function balanceFor(session: LoginResult, code: string, year: number): Promise<BalanceRow | null> {
  const response = await request(app)
    .get(`/api/v1/leave-balances/me?year=${year}`)
    .set(bearer(session))
    .expect(200);
  const match = (response.body.data.items as BalanceRow[]).find((row) => row.leaveType.code === code);
  return match ?? null;
}

/** A year only gets balance rows once it is used, so unknown rows start at zero. */
function balanceOrZero(row: BalanceRow | null, code: string): BalanceRow {
  return row ?? { leaveType: { code }, allocated: 0, used: 0, pending: 0, available: 0 };
}

describe('/api/v1/leave', () => {
  let hrAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [hrAdmin, manager, employee] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
    ]);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/leaves/my').expect(401);
    await request(app).get('/api/v1/leave-types').expect(401);
    await request(app).get('/api/v1/leave-balances/me').expect(401);
    await request(app).get('/api/v1/holidays').expect(401);
  });

  it('validates the apply payload', async () => {
    const sickLeave = await leaveTypeByCode(employee, 'SL');
    const range = futureRange(140, 2);

    await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: sickLeave.id, startDate: range.start, endDate: range.end, reason: 'no' })
      .expect(400);

    await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: sickLeave.id, startDate: range.end, endDate: range.start, reason: 'Backwards range' })
      .expect(400);

    await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({
        leaveTypeId: sickLeave.id,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        reason: 'Backdated request',
      })
      .expect(422);

    await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: 'not-a-uuid', startDate: range.start, endDate: range.end, reason: 'Bad type id' })
      .expect(400);
  });

  it('applies for leave, reserves balance and rejects overlaps', async () => {
    const sickLeave = await leaveTypeByCode(employee, 'SL');
    const range = futureRange(120, 3);
    const before = balanceOrZero(await balanceFor(employee, 'SL', range.year), 'SL');

    const created = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({
        leaveTypeId: sickLeave.id,
        startDate: range.start,
        endDate: range.end,
        reason: 'Dental surgery follow up',
        contactDuringLeave: '+91 90000 11111',
      })
      .expect(201);

    const request0 = created.body.data as LeaveRequestRow;
    expect(request0.status).toBe('PENDING');
    expect(request0.managerStage).toBe('PENDING');
    expect(request0.hrStage).toBe('PENDING');
    expect(request0.totalDays).toBeGreaterThan(0);
    expect(request0.employeeId).toBe(employee.employeeId);

    const after = balanceOrZero(await balanceFor(employee, 'SL', range.year), 'SL');
    expect(after.pending).toBeCloseTo(before.pending + request0.totalDays, 5);
    expect(after.allocated).toBe(sickLeave.annualQuota);
    expect(after.available).toBeCloseTo(after.allocated - after.pending, 5);

    await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: sickLeave.id, startDate: range.start, endDate: range.end, reason: 'Overlapping request' })
      .expect(409);

    const listed = await request(app)
      .get('/api/v1/leaves/my?status=PENDING&limit=100')
      .set(bearer(employee))
      .expect(200);

    expect((listed.body.data as LeaveRequestRow[]).some((row) => row.id === request0.id)).toBe(true);
  });

  it('enforces the advance notice rule of a leave type', async () => {
    const earnedLeave = await leaveTypeByCode(employee, 'EL');

    const response = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({
        leaveTypeId: earnedLeave.id,
        startDate: toDateInputValue(addUtcDays(startOfUtcDay(new Date()), 1)),
        endDate: toDateInputValue(addUtcDays(startOfUtcDay(new Date()), 2)),
        reason: 'Short notice trip',
      })
      .expect(422);

    expect(response.body.message).toContain('notice');
  });

  it('runs the two stage approval flow and books the balance', async () => {
    const casualLeave = await leaveTypeByCode(employee, 'CL');
    const range = futureRange(130, 2);
    const before = balanceOrZero(await balanceFor(employee, 'CL', range.year), 'CL');

    const created = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: casualLeave.id, startDate: range.start, endDate: range.end, reason: 'Personal work' })
      .expect(201);

    const id = created.body.data.id as string;
    const totalDays = (created.body.data as LeaveRequestRow).totalDays;

    await request(app).get('/api/v1/leaves/approvals').set(bearer(employee)).expect(403);

    const inbox = await request(app).get('/api/v1/leaves/approvals?limit=100').set(bearer(manager)).expect(200);
    expect((inbox.body.data as LeaveRequestRow[]).some((row) => row.id === id)).toBe(true);

    await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(manager))
      .send({ decision: 'REJECT' })
      .expect(400);

    const managerStep = await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(manager))
      .send({ decision: 'APPROVE', remark: 'Team coverage confirmed' })
      .expect(200);

    expect(managerStep.body.data.status).toBe('PENDING');
    expect(managerStep.body.data.managerStage).toBe('APPROVED');
    expect(managerStep.body.data.hrStage).toBe('PENDING');

    const managerCannotFinish = await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(manager))
      .send({ decision: 'APPROVE' })
      .expect(403);

    expect(managerCannotFinish.body.success).toBe(false);

    const hrStep = await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(hrAdmin))
      .send({ decision: 'APPROVE', remark: 'Balances verified' })
      .expect(200);

    expect(hrStep.body.data.status).toBe('APPROVED');
    expect(hrStep.body.data.hrStage).toBe('APPROVED');

    const after = balanceOrZero(await balanceFor(employee, 'CL', range.year), 'CL');
    expect(after.used).toBeCloseTo(before.used + totalDays, 5);
    expect(after.pending).toBeCloseTo(before.pending, 5);

    const attendance = await request(app)
      .get(`/api/v1/attendance?employeeId=${employee.employeeId}&status=ON_LEAVE&from=${range.start}&to=${range.end}`)
      .set(bearer(hrAdmin))
      .expect(200);

    expect(attendance.body.meta.total).toBe(totalDays);

    await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(hrAdmin))
      .send({ decision: 'APPROVE' })
      .expect(409);
  });

  it('rejects a request, releases the reservation and blocks self approval', async () => {
    const casualLeave = await leaveTypeByCode(employee, 'CL');
    const range = futureRange(150, 2);
    const before = balanceOrZero(await balanceFor(employee, 'CL', range.year), 'CL');

    const created = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: casualLeave.id, startDate: range.start, endDate: range.end, reason: 'Trying to decline' })
      .expect(201);

    const id = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(employee))
      .send({ decision: 'APPROVE' })
      .expect(403);

    const rejected = await request(app)
      .post(`/api/v1/leaves/${id}/decision`)
      .set(bearer(manager))
      .send({ decision: 'REJECT', remark: 'Release week, please pick another slot' })
      .expect(200);

    expect(rejected.body.data.status).toBe('REJECTED');
    expect(rejected.body.data.managerStage).toBe('REJECTED');

    const after = balanceOrZero(await balanceFor(employee, 'CL', range.year), 'CL');
    expect(after.pending).toBeCloseTo(before.pending, 5);

    await request(app)
      .post(`/api/v1/leaves/${id}/cancel`)
      .set(bearer(employee))
      .send({ reason: 'Trying to cancel a rejected request' })
      .expect(409);
  });

  it('cancels a pending request and frees the reserved days', async () => {
    const sickLeave = await leaveTypeByCode(employee, 'SL');
    const range = futureRange(170, 2);
    const before = balanceOrZero(await balanceFor(employee, 'SL', range.year), 'SL');

    const created = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({ leaveTypeId: sickLeave.id, startDate: range.start, endDate: range.end, reason: 'Cancelled later' })
      .expect(201);

    const id = created.body.data.id as string;

    const cancelled = await request(app)
      .post(`/api/v1/leaves/${id}/cancel`)
      .set(bearer(employee))
      .send({ reason: 'Recovered and no longer needed' })
      .expect(200);

    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.cancellationReason).toBe('Recovered and no longer needed');

    const after = balanceOrZero(await balanceFor(employee, 'SL', range.year), 'SL');
    expect(after.pending).toBeCloseTo(before.pending, 5);

    const detail = await request(app).get(`/api/v1/leaves/${id}`).set(bearer(employee)).expect(200);
    expect(detail.body.data.status).toBe('CANCELLED');
  });

  it('hides another employee request from a plain employee', async () => {
    const sickLeave = await leaveTypeByCode(hrAdmin, 'SL');
    const range = futureRange(200, 2);

    const created = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(hrAdmin))
      .send({ leaveTypeId: sickLeave.id, startDate: range.start, endDate: range.end, reason: 'HR own request' })
      .expect(201);

    const id = created.body.data.id as string;

    await request(app).get(`/api/v1/leaves/${id}`).set(bearer(employee)).expect(403);

    const all = await request(app).get('/api/v1/leaves?limit=100').set(bearer(hrAdmin)).expect(200);
    expect((all.body.data as LeaveRequestRow[]).some((row) => row.id === id)).toBe(true);

    await request(app)
      .post(`/api/v1/leaves/${id}/cancel`)
      .set(bearer(employee))
      .send({ reason: 'Not my request' })
      .expect(403);

    await request(app)
      .post(`/api/v1/leaves/${id}/cancel`)
      .set(bearer(hrAdmin))
      .send({ reason: 'Cleaning up the test request' })
      .expect(200);
  });

  it('restricts employee balances to the caller', async () => {
    const own = await request(app).get('/api/v1/leave-balances/me').set(bearer(employee)).expect(200);
    expect((own.body.data.items as BalanceRow[]).length).toBeGreaterThan(0);

    const viaHr = await request(app)
      .get(`/api/v1/leave-balances/${employee.employeeId}`)
      .set(bearer(hrAdmin))
      .expect(200);
    expect(viaHr.body.data.employee.employeeCode).toBeTruthy();

    await request(app)
      .get(`/api/v1/leave-balances/${hrAdmin.employeeId}`)
      .set(bearer(employee))
      .expect(403);
  });

  it('manages leave types with uniqueness and dependency guards', async () => {
    await request(app).post('/api/v1/leave-types').set(bearer(employee)).send({ name: 'Nope', code: 'NP' }).expect(403);

    const code = `Q${String(Date.now() % 10000).padStart(4, '0')}`;

    const created = await request(app)
      .post('/api/v1/leave-types')
      .set(bearer(hrAdmin))
      .send({
        name: `Quality Leave ${code}`,
        code,
        description: 'Created by the test suite',
        unit: 'DAYS',
        annualQuota: 4,
        isPaid: true,
        allowsCarryForward: false,
        maxCarryForward: 0,
        requiresDocument: false,
        minDaysNotice: 0,
        color: '#0ea5e9',
        isActive: true,
      })
      .expect(201);

    const id = created.body.data.id as string;
    expect(created.body.data.annualQuota).toBe(4);

    await request(app)
      .post('/api/v1/leave-types')
      .set(bearer(hrAdmin))
      .send({ name: 'Duplicate code type', code, annualQuota: 2 })
      .expect(409);

    const invalid = await request(app)
      .post('/api/v1/leave-types')
      .set(bearer(hrAdmin))
      .send({ name: 'Broken carry forward', code: `${code}X`, annualQuota: 2, allowsCarryForward: true })
      .expect(400);
    expect(invalid.body.success).toBe(false);

    const balance = await request(app)
      .get(`/api/v1/leave-balances/${employee.employeeId}`)
      .set(bearer(hrAdmin))
      .expect(200);

    const rows = (balance.body.data.items as (BalanceRow & { leaveType: { id: string } })[]).filter(
      (row) => row.leaveType.id === id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.allocated).toBe(4);

    const updated = await request(app)
      .patch(`/api/v1/leave-types/${id}`)
      .set(bearer(hrAdmin))
      .send({ name: `Quality Leave ${code} renamed`, minDaysNotice: 2 })
      .expect(200);
    expect(updated.body.data.minDaysNotice).toBe(2);

    const casualLeave = await leaveTypeByCode(hrAdmin, 'CL');
    await request(app).delete(`/api/v1/leave-types/${casualLeave.id}`).set(bearer(hrAdmin)).expect(409);

    await request(app).delete(`/api/v1/leave-types/${id}`).set(bearer(hrAdmin)).expect(200);

    const active = await request(app).get('/api/v1/leave-types?limit=100').set(bearer(employee)).expect(200);
    expect((active.body.data as LeaveTypeRow[]).some((row) => row.id === id)).toBe(false);

    const withInactive = await request(app)
      .get('/api/v1/leave-types?includeInactive=true&limit=100')
      .set(bearer(employee))
      .expect(200);
    expect((withInactive.body.data as LeaveTypeRow[]).some((row) => row.id === id)).toBe(false);
  });
});

describe('/api/v1/leave-balances', () => {
  let hrAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;
  const thisYear = new Date().getUTCFullYear();
  const nextYear = thisYear + 1;

  beforeAll(async () => {
    [hrAdmin, manager, employee] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
    ]);
  });

  async function employeeBalances(session: LoginResult, year: number): Promise<ManageableBalance[]> {
    const response = await request(app)
      .get(`/api/v1/leave-balances/${employee.employeeId}?year=${year}`)
      .set(bearer(session))
      .expect(200);

    return response.body.data.items as ManageableBalance[];
  }

  /** Creates a leave type and returns its id. */
  async function createType(body: Record<string, unknown>): Promise<string> {
    const created = await request(app)
      .post('/api/v1/leave-types')
      .set(bearer(hrAdmin))
      .send(body)
      .expect(201);

    return created.body.data.id as string;
  }

  async function rowFor(year: number, leaveTypeId: string) {
    const rows = await employeeBalances(hrAdmin, year);
    return rows.find((row) => row.leaveType.id === leaveTypeId);
  }

  it('lets HR grant an allocation and blocks employees', async () => {
    const leaveTypeId = await createType({
      name: `Grant Leave ${String(Date.now() % 100000)}`,
      code: `G${String(Date.now() % 100000)}`,
      unit: 'DAYS',
      annualQuota: 5,
      isPaid: true,
      allowsCarryForward: false,
      maxCarryForward: 0,
      requiresDocument: false,
      minDaysNotice: 0,
      isActive: true,
    });

    const row = await rowFor(thisYear, leaveTypeId);
    expect(row?.allocated).toBe(5);

    await request(app)
      .patch(`/api/v1/leave-balances/${row?.id}`)
      .set(bearer(employee))
      .send({ allocated: 10 })
      .expect(403);

    await request(app)
      .patch(`/api/v1/leave-balances/${row?.id}`)
      .set(bearer(hrAdmin))
      .send({ note: 'Nothing to change' })
      .expect(400);

    const adjusted = await request(app)
      .patch(`/api/v1/leave-balances/${row?.id}`)
      .set(bearer(hrAdmin))
      .send({ allocated: 10, note: 'Comp time granted by HR' })
      .expect(200);

    expect(adjusted.body.data.allocated).toBe(10);
    expect(adjusted.body.data.available).toBe(10);
    expect(adjusted.body.data.employee.id).toBe(employee.employeeId);

    const after = await rowFor(thisYear, leaveTypeId);
    expect(after?.allocated).toBe(10);

    await request(app)
      .patch('/api/v1/leave-balances/2f2c2f4a-0000-4000-8000-000000000000')
      .set(bearer(hrAdmin))
      .send({ allocated: 1 })
      .expect(404);
  });

  it('refuses to allocate below the days already used or pending', async () => {
    const sickLeave = await leaveTypeByCode(employee, 'SL');
    const range = futureRange(30, 2);

    const applied = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({
        leaveTypeId: sickLeave.id,
        startDate: range.start,
        endDate: range.end,
        reason: 'Balance guard test request',
      })
      .expect(201);

    const totalDays = applied.body.data.totalDays as number;
    expect(totalDays).toBeGreaterThan(0);

    const row = await rowFor(range.year, sickLeave.id);
    expect(row?.pending).toBeGreaterThanOrEqual(totalDays);

    await request(app)
      .patch(`/api/v1/leave-balances/${row?.id}`)
      .set(bearer(hrAdmin))
      .send({ allocated: 0 })
      .expect(422);

    await request(app)
      .post(`/api/v1/leaves/${applied.body.data.id}/decision`)
      .set(bearer(manager))
      .send({ decision: 'APPROVE' })
      .expect(200);

    await request(app)
      .post(`/api/v1/leaves/${applied.body.data.id}/decision`)
      .set(bearer(hrAdmin))
      .send({ decision: 'APPROVE' })
      .expect(200);

    await request(app)
      .post(`/api/v1/leaves/${applied.body.data.id}/cancel`)
      .set(bearer(hrAdmin))
      .send({ reason: 'Cleaning up after the balance guard test' })
      .expect(200);
  });

  it('rolls balances into the next year and caps carry forward', async () => {
    const suffix = String(Date.now() % 100000);
    const cappedTypeId = await createType({
      name: `Capped Carry ${suffix}`,
      code: `C${suffix}`,
      unit: 'DAYS',
      annualQuota: 3,
      isPaid: true,
      allowsCarryForward: true,
      maxCarryForward: 2,
      requiresDocument: false,
      minDaysNotice: 0,
      isActive: true,
    });

    const noCarryTypeId = await createType({
      name: `No Carry ${suffix}`,
      code: `N${suffix}`,
      unit: 'DAYS',
      annualQuota: 4,
      isPaid: true,
      allowsCarryForward: false,
      maxCarryForward: 0,
      requiresDocument: false,
      minDaysNotice: 0,
      isActive: true,
    });

    await request(app).post('/api/v1/leave-balances/rollover').set(bearer(employee)).query({}).expect(403);
    await request(app)
      .post('/api/v1/leave-balances/rollover')
      .set(bearer(hrAdmin))
      .query({ fromYear: thisYear, toYear: nextYear + 1 })
      .expect(400);

    const first = await request(app)
      .post('/api/v1/leave-balances/rollover')
      .set(bearer(hrAdmin))
      .query({ fromYear: thisYear, toYear: nextYear })
      .expect(200);

    expect(first.body.data.created).toBeGreaterThan(0);

    const capped = await rowFor(nextYear, cappedTypeId);
    expect(capped?.allocated).toBe(3);
    expect(capped?.carriedForward).toBe(2);

    const noCarry = await rowFor(nextYear, noCarryTypeId);
    expect(noCarry?.allocated).toBe(4);
    expect(noCarry?.carriedForward).toBe(0);

    const granted = await request(app)
      .patch(`/api/v1/leave-balances/${capped?.id}`)
      .set(bearer(hrAdmin))
      .send({ allocated: 12 })
      .expect(200);
    expect(granted.body.data.allocated).toBe(12);

    const second = await request(app)
      .post('/api/v1/leave-balances/rollover')
      .set(bearer(hrAdmin))
      .query({ fromYear: thisYear, toYear: nextYear })
      .expect(200);

    expect(second.body.data.created).toBe(0);

    const rows = await employeeBalances(hrAdmin, nextYear);
    expect(rows.filter((row) => row.leaveType.id === cappedTypeId)).toHaveLength(1);
    expect(rows.find((row) => row.leaveType.id === cappedTypeId)?.allocated).toBe(12);
  });
});

describe('/api/v1/holidays', () => {
  let hrAdmin: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [hrAdmin, employee] = await Promise.all([login(ACCOUNTS.hrAdmin), login(ACCOUNTS.employee)]);
  });

  it('lists holidays for the current year and filters by type', async () => {
    const year = new Date().getUTCFullYear();

    const all = await request(app).get(`/api/v1/holidays?year=${year}&limit=100`).set(bearer(employee)).expect(200);
    expect(all.body.data.length).toBeGreaterThan(0);

    const publicOnly = await request(app)
      .get(`/api/v1/holidays?year=${year}&type=PUBLIC&limit=100`)
      .set(bearer(employee))
      .expect(200);

    expect((publicOnly.body.data as { type: string }[]).every((row) => row.type === 'PUBLIC')).toBe(true);

    await request(app)
      .get(`/api/v1/holidays?from=${year}-12-31&to=${year}-01-01`)
      .set(bearer(employee))
      .expect(400);
  });

  it('creates, updates and deletes a holiday with HR permissions', async () => {
    const name = `Test Holiday ${String(Date.now() % 100000)}`;
    const year = new Date().getUTCFullYear();
    const date = `${year}-06-15`;

    await request(app)
      .post('/api/v1/holidays')
      .set(bearer(employee))
      .send({ name, date })
      .expect(403);

    const created = await request(app)
      .post('/api/v1/holidays')
      .set(bearer(hrAdmin))
      .send({ name, date, type: 'OPTIONAL', description: 'Added by the test suite' })
      .expect(201);

    const id = created.body.data.id as string;
    expect(created.body.data.type).toBe('OPTIONAL');

    await request(app)
      .post('/api/v1/holidays')
      .set(bearer(hrAdmin))
      .send({ name, date })
      .expect(409);

    const updated = await request(app)
      .patch(`/api/v1/holidays/${id}`)
      .set(bearer(hrAdmin))
      .send({ name: `${name} v2`, isActive: false })
      .expect(200);
    expect(updated.body.data.name).toBe(`${name} v2`);
    expect(updated.body.data.isActive).toBe(false);

    const hidden = await request(app).get(`/api/v1/holidays?year=${year}&limit=100`).set(bearer(employee)).expect(200);
    expect((hidden.body.data as { id: string }[]).some((row) => row.id === id)).toBe(false);

    const visible = await request(app)
      .get(`/api/v1/holidays?year=${year}&includeInactive=true&limit=100`)
      .set(bearer(employee))
      .expect(200);
    expect((visible.body.data as { id: string }[]).some((row) => row.id === id)).toBe(true);

    await request(app).delete(`/api/v1/holidays/${id}`).set(bearer(employee)).expect(403);
    await request(app).delete(`/api/v1/holidays/${id}`).set(bearer(hrAdmin)).expect(200);
    await request(app).delete(`/api/v1/holidays/${id}`).set(bearer(hrAdmin)).expect(404);
  });
});
