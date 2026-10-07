import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { toDateInputValue } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

interface SalaryStructureRow {
  id: string;
  employeeId: string;
  basicSalary: number;
  otherAllowance: number;
  grossSalary: number;
  netSalary: number;
  effectiveTo: string | null;
  isActive: boolean;
}

interface PayslipRow {
  id: string;
  employeeId: string;
  grossSalary: number;
  netSalary: number;
  workingDays: number;
  daysPresent: number;
  daysAbsent: number;
  daysPaidLeave: number;
  lopDays: number;
  status: string;
}

/** The month before the current one, so payroll can be processed. */
function previousMonth(): { year: number; month: number } {
  const now = new Date();
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previous = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  return { year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1 };
}

describe('/api/v1/payroll', () => {
  let finance: LoginResult;
  let hrAdmin: LoginResult;
  let employee: LoginResult;
  let employeeRecordId: string;
  let structureId: string;
  const period = previousMonth();

  beforeAll(async () => {
    [finance, hrAdmin, employee] = await Promise.all([
      login(ACCOUNTS.finance),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
    ]);

    employeeRecordId = employee.employeeId ?? '';
    expect(employeeRecordId).not.toBe('');
  });

  it('enforces salary and payroll permissions', async () => {
    await request(app).get('/api/v1/payroll/salary-structures').expect(401);
    await request(app).get('/api/v1/payroll/runs').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/payroll/runs').set(bearer(finance)).expect(200);

    // HR may read compensation but only finance may change it.
    await request(app)
      .post('/api/v1/payroll/salary-structures')
      .set(bearer(hrAdmin))
      .send({ employeeId: employeeRecordId, effectiveFrom: '2026-01-01', basicSalary: 1000 })
      .expect(403);

    await request(app)
      .post('/api/v1/payroll/runs/process')
      .set(bearer(employee))
      .send(period)
      .expect(403);
  });

  it('creates a salary structure and recomputes gross and net', async () => {
    // Start after every seeded structure so this revision becomes the current one.
    const latestExisting = await prisma.salaryStructure.findFirst({
      where: { employeeId: employeeRecordId },
      select: { effectiveFrom: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    const effectiveFrom = toDateInputValue(
      new Date(
        Date.UTC(
          (latestExisting?.effectiveFrom ?? new Date(Date.UTC(period.year - 1, 0, 1))).getUTCFullYear() + 1,
          0,
          1,
        ),
      ),
    );

    const created = await request(app)
      .post('/api/v1/payroll/salary-structures')
      .set(bearer(finance))
      .send({
        employeeId: employeeRecordId,
        effectiveFrom,
        basicSalary: 50000,
        hra: 20000,
        transportAllowance: 3000,
        medicalAllowance: 1500,
        otherAllowance: 500,
        pf: 6000,
        esi: 0,
        professionalTax: 200,
        tds: 1000,
        otherDeduction: 0,
      })
      .expect(201);

    const structure = created.body.data as SalaryStructureRow;
    structureId = structure.id;

    expect(structure.grossSalary).toBe(75000);
    expect(structure.netSalary).toBe(67800);

    await request(app)
      .post('/api/v1/payroll/salary-structures')
      .set(bearer(finance))
      .send({ employeeId: employeeRecordId, effectiveFrom, basicSalary: 1000 })
      .expect(409);

    // Zero basic salary is rejected by the schema.
    await request(app)
      .post('/api/v1/payroll/salary-structures')
      .set(bearer(finance))
      .send({ employeeId: employeeRecordId, effectiveFrom, basicSalary: 0 })
      .expect(400);
  });

  it('lets finance adjust an open structure and deactivates the previous one', async () => {
    const updated = await request(app)
      .patch(`/api/v1/payroll/salary-structures/${structureId}`)
      .set(bearer(finance))
      .send({ otherAllowance: 2500 })
      .expect(200);

    const structure = updated.body.data as SalaryStructureRow;
    expect(structure.otherAllowance).toBe(2500);
    expect(structure.grossSalary).toBe(77000);
    expect(structure.netSalary).toBe(69800);

    const deactivated = await request(app)
      .patch(`/api/v1/payroll/salary-structures/${structureId}`)
      .set(bearer(finance))
      .send({ isActive: false })
      .expect(200);
    expect((deactivated.body.data as SalaryStructureRow).isActive).toBe(false);

    await request(app)
      .patch(`/api/v1/payroll/salary-structures/${structureId}`)
      .set(bearer(finance))
      .send({ isActive: true })
      .expect(200);
  });

  it('scopes salary visibility to the owner', async () => {
    const own = await request(app).get('/api/v1/payroll/salary-structures').set(bearer(employee)).expect(200);
    const rows = own.body.data as SalaryStructureRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.employeeId === employeeRecordId)).toBe(true);

    await request(app)
      .get(`/api/v1/payroll/salary-structures/${structureId}`)
      .set(bearer(employee))
      .expect(200);
  });

  it('processes payroll from attendance and derives loss of pay', async () => {
    const processed = await request(app)
      .post('/api/v1/payroll/runs/process')
      .set(bearer(finance))
      .send(period)
      .expect(201);

    const run = processed.body.data as {
      id: string;
      status: string;
      employeeCount: number;
      missingSalaryStructures: number;
    };
    expect(run.employeeCount).toBeGreaterThan(0);
    expect(run.status).toBe('PROCESSED');

    const payslips = await request(app)
      .get(`/api/v1/payroll/payslips?year=${period.year}&month=${period.month}&limit=100`)
      .set(bearer(finance))
      .expect(200);

    const mine = (payslips.body.data as PayslipRow[]).find((row) => row.employeeId === employeeRecordId);
    expect(mine).toBeDefined();
    const slip = mine as PayslipRow;
    expect(slip.workingDays).toBeGreaterThan(0);
    expect(slip.daysPresent + slip.daysPaidLeave + slip.daysAbsent).toBe(slip.workingDays);
    expect(slip.lopDays).toBe(slip.daysAbsent);
    expect(mine?.netSalary).toBeLessThanOrEqual(mine?.grossSalary ?? 0);

    const duplicated = await request(app)
      .post('/api/v1/payroll/runs/process')
      .set(bearer(finance))
      .send(period)
      .expect(409);
    expect(duplicated.body.message).toContain('already been');
  });

  it('accepts both padded and unpadded period filters', async () => {
    const padded = await request(app)
      .get(`/api/v1/payroll/runs?year=${period.year}&month=${String(period.month).padStart(2, '0')}`)
      .set(bearer(finance))
      .expect(200);
    const unpadded = await request(app)
      .get(`/api/v1/payroll/runs?year=${period.year}&month=${period.month}`)
      .set(bearer(finance))
      .expect(200);
    expect(padded.body.meta.total).toBe(unpadded.body.meta.total);
    expect(unpadded.body.meta.total).toBeGreaterThan(0);

    const payslips = await request(app)
      .get(`/api/v1/payroll/payslips?year=${period.year}&month=${period.month}&limit=100`)
      .set(bearer(finance))
      .expect(200);
    expect(payslips.body.meta.total).toBeGreaterThan(0);

    await request(app).get('/api/v1/payroll/runs?month=13').set(bearer(finance)).expect(400);
  });

  it('refuses to process a month that has not finished', async () => {
    const now = new Date();
    await request(app)
      .post('/api/v1/payroll/runs/process')
      .set(bearer(finance))
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(422);
  });

  it('locks a run, which locks its payslips and blocks reprocessing', async () => {
    const runs = await request(app).get('/api/v1/payroll/runs?limit=50').set(bearer(finance)).expect(200);
    const run = (runs.body.data as Array<{ id: string; month: number; year: number; status: string }>).find(
      (row) => row.month === period.month && row.year === period.year,
    );
    expect(run).toBeDefined();

    const locked = await request(app)
      .post(`/api/v1/payroll/runs/${run?.id}/lock`)
      .set(bearer(finance))
      .expect(200);
    expect((locked.body.data as { status: string }).status).toBe('LOCKED');

    const payslips = await request(app)
      .get(`/api/v1/payroll/payslips?year=${period.year}&month=${period.month}&limit=100`)
      .set(bearer(finance))
      .expect(200);
    expect((payslips.body.data as PayslipRow[]).every((row) => row.status === 'LOCKED')).toBe(true);

    await request(app).post(`/api/v1/payroll/runs/${run?.id}/lock`).set(bearer(finance)).expect(409);
    await request(app).post('/api/v1/payroll/runs/process').set(bearer(finance)).send(period).expect(409);
  });

  it('shows an employee only their own payslip', async () => {
    const mine = await request(app).get('/api/v1/payroll/payslips').set(bearer(employee)).expect(200);
    const rows = mine.body.data as PayslipRow[];
    expect(rows.every((row) => row.employeeId === employeeRecordId)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/payroll/payslips/${rows[0]?.id}`)
      .set(bearer(employee))
      .expect(200);
    expect((detail.body.data as PayslipRow).employeeId).toBe(employeeRecordId);

    const other = await prisma.payslip.findFirst({
      where: { employeeId: { not: employeeRecordId } },
      select: { id: true },
    });

    if (other) {
      await request(app).get(`/api/v1/payroll/payslips/${other.id}`).set(bearer(employee)).expect(403);
    }

    await request(app)
      .get('/api/v1/payroll/payslips')
      .query({ employeeId: 'not-a-uuid' })
      .set(bearer(finance))
      .expect(400);
  });

  it('refuses to delete a structure that has taken effect', async () => {
    // A structure already covering today cannot be removed, only deactivated.
    const inEffect = await prisma.salaryStructure.findFirst({
      where: { employeeId: employeeRecordId, effectiveFrom: { lte: new Date() } },
      select: { id: true },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(inEffect).not.toBeNull();
    await request(app).delete(`/api/v1/payroll/salary-structures/${inEffect?.id}`).set(bearer(finance)).expect(409);

    const future = new Date(Date.UTC(new Date().getUTCFullYear() + 2, 0, 1));
    const created = await request(app)
      .post('/api/v1/payroll/salary-structures')
      .set(bearer(finance))
      .send({
        employeeId: employeeRecordId,
        effectiveFrom: toDateInputValue(future),
        basicSalary: 80000,
        hra: 0,
      })
      .expect(201);

    const removed = await request(app)
      .delete(`/api/v1/payroll/salary-structures/${(created.body.data as SalaryStructureRow).id}`)
      .set(bearer(finance))
      .expect(200);
    expect((removed.body.data as { id: string }).id).toBe((created.body.data as SalaryStructureRow).id);
  });

  it('writes audit entries for salary and payroll changes', async () => {
    const superAdmin = await login(ACCOUNTS.superAdmin);
    const action = (rows: Array<{ action: string }>, name: string) =>
      rows.find((row) => row.action === name);

    const salaryAudit = await request(app)
      .get('/api/v1/audit-logs?entity=SalaryStructure&limit=20')
      .set(bearer(superAdmin))
      .expect(200);

    const salaryRows = salaryAudit.body.data as Array<{ action: string; userEmail: string | null }>;
    expect(action(salaryRows, 'SALARY_CREATE')).toBeDefined();
    expect(action(salaryRows, 'SALARY_UPDATE')).toBeDefined();
    expect(salaryRows.every((row) => row.userEmail === ACCOUNTS.finance.email)).toBe(true);

    const runAudit = await request(app)
      .get('/api/v1/audit-logs?entity=PayrollRun&limit=20')
      .set(bearer(superAdmin))
      .expect(200);

    const runRows = runAudit.body.data as Array<{ action: string; userEmail: string | null }>;
    expect(action(runRows, 'PAYROLL_PROCESS')).toBeDefined();
    expect(action(runRows, 'PAYROLL_LOCK')).toBeDefined();
    expect(runRows.every((row) => row.userEmail === ACCOUNTS.finance.email)).toBe(true);

    const payslipAudit = await request(app)
      .get('/api/v1/audit-logs?action=PAYSLIP_DOWNLOAD&limit=20')
      .set(bearer(superAdmin))
      .expect(200);

    expect((payslipAudit.body.data as Array<{ userEmail: string | null }>)[0]?.userEmail).toBe(
      ACCOUNTS.employee.email,
    );
  });
});