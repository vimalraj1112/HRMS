import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { addUtcDays, startOfUtcDay, toDateInputValue } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const today = (): string => toDateInputValue(startOfUtcDay(new Date()));
const dayOffset = (days: number): string => toDateInputValue(addUtcDays(startOfUtcDay(new Date()), days));

interface AttendanceRow {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  totalMinutes: number | null;
  source: string;
  isCorrected: boolean;
  employee: { employeeCode: string; firstName: string };
}

describe('/api/v1/attendance', () => {
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
    await request(app).get('/api/v1/attendance/my').expect(401);
    await request(app).get('/api/v1/attendance').expect(401);
    await request(app).get('/api/v1/attendance/summary?month=01&year=2026').expect(401);
  });

  it('returns only the caller records for an employee', async () => {
    const response = await request(app).get('/api/v1/attendance/my?limit=100').set(bearer(employee)).expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(new Set((response.body.data as AttendanceRow[]).map((row) => row.employeeId))).toEqual(
      new Set(employee.employeeId ? [employee.employeeId] : []),
    );
  });

  it('rejects employee access to another employee records', async () => {
    await request(app).get('/api/v1/attendance/team').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/attendance').set(bearer(employee)).expect(200);

    const otherId = hrAdmin.employeeId;
    expect(otherId).toBeTruthy();

    await request(app)
      .get(`/api/v1/attendance?employeeId=${otherId}`)
      .set(bearer(employee))
      .expect(403);
  });

  it('limits managers to their own team', async () => {
    const response = await request(app).get('/api/v1/attendance/team?limit=100').set(bearer(manager)).expect(200);

    const employeeIds = new Set((response.body.data as AttendanceRow[]).map((row) => row.employeeId));
    expect(employeeIds.size).toBeGreaterThan(0);
    expect(employeeIds.has(manager.employeeId as string)).toBe(true);
    expect(employeeIds.has(employee.employeeId as string)).toBe(true);

    await request(app)
      .get(`/api/v1/attendance?employeeId=${hrAdmin.employeeId}`)
      .set(bearer(manager))
      .expect(403);
  });

  it('filters by status and date range for HR', async () => {
    const response = await request(app)
      .get(`/api/v1/attendance?status=LATE&from=${dayOffset(-10)}&to=${today()}&limit=5`)
      .set(bearer(hrAdmin))
      .expect(200);

    const rows = response.body.data as AttendanceRow[];
    expect(rows.every((row) => row.status === 'LATE')).toBe(true);
  });

  it('rejects an inverted date range', async () => {
    await request(app)
      .get(`/api/v1/attendance?from=${today()}&to=${dayOffset(-5)}`)
      .set(bearer(employee))
      .expect(400);
  });

  it('validates the monthly summary query', async () => {
    await request(app).get('/api/v1/attendance/summary').set(bearer(employee)).expect(400);
    await request(app).get('/api/v1/attendance/summary?month=13&year=2026').set(bearer(employee)).expect(400);
    await request(app).get('/api/v1/attendance/summary?year=2026').set(bearer(employee)).expect(400);

    const year = new Date().getUTCFullYear();
    const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');

    const own = await request(app)
      .get(`/api/v1/attendance/summary?month=${month}&year=${year}`)
      .set(bearer(employee))
      .expect(200);

    expect(own.body.data).toHaveLength(1);
    expect(own.body.data[0].employeeId).toBe(employee.employeeId);
    expect(own.body.data[0].calendarDays).toBeGreaterThan(0);

    const all = await request(app)
      .get(`/api/v1/attendance/summary?month=${month}&year=${year}&limit=100`)
      .set(bearer(hrAdmin))
      .expect(200);

    expect(all.body.meta.total).toBeGreaterThan(1);
  });

  it('blocks employees from marking the wrong statuses or dates', async () => {
    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: dayOffset(1), status: 'PRESENT', checkIn: '09:30' })
      .expect(422);

    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: dayOffset(-3), status: 'PRESENT', checkIn: '09:30' })
      .expect(422);

    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: today(), status: 'ABSENT' })
      .expect(422);

    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: today(), status: 'PRESENT' })
      .expect(400);
  });

  it('rejects an employee marking attendance for someone else', async () => {
    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ employeeId: hrAdmin.employeeId, date: dayOffset(-40), status: 'PRESENT', checkIn: '09:00' })
      .expect(403);
  });

  it('rejects a duplicate self submission and an invalid time range', async () => {
    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: today(), status: 'PRESENT', checkIn: '09:00', checkOut: '08:00' })
      .expect(400);

    await request(app)
      .post('/api/v1/attendance')
      .set(bearer(employee))
      .send({ date: today(), status: 'PRESENT', checkIn: '09:00' })
      .expect(409);
  });

  it('lets HR record and correct attendance outside the seeded window', async () => {
    const targetEmployee = employee.employeeId as string;
    const date = dayOffset(-40);

    const created = await request(app)
      .post('/api/v1/attendance')
      .set(bearer(hrAdmin))
      .send({ employeeId: targetEmployee, date, status: 'ABSENT' })
      .expect(201);

    expect(created.body.data.status).toBe('ABSENT');
    expect(created.body.data.isCorrected).toBe(false);
    const id = created.body.data.id as string;

    const corrected = await request(app)
      .patch(`/api/v1/attendance/${id}`)
      .set(bearer(hrAdmin))
      .send({ status: 'PRESENT', checkIn: '09:15', checkOut: '18:05', notes: 'Badge reader was offline' })
      .expect(200);

    expect(corrected.body.data.status).toBe('PRESENT');
    expect(corrected.body.data.isCorrected).toBe(true);
    expect(corrected.body.data.totalMinutes).toBe(530);
    expect(corrected.body.data.notes).toBe('Badge reader was offline');

    const byEmployee = await request(app)
      .patch(`/api/v1/attendance/${id}`)
      .set(bearer(employee))
      .send({ status: 'ABSENT' })
      .expect(403);

    expect(byEmployee.body.success).toBe(false);

    const missing = await request(app)
      .patch('/api/v1/attendance/00000000-0000-0000-0000-000000000000')
      .set(bearer(hrAdmin))
      .send({ status: 'ABSENT' })
      .expect(404);

    expect(missing.body.success).toBe(false);
  });

  it('keeps week off records without times', async () => {
    const created = await request(app)
      .post('/api/v1/attendance')
      .set(bearer(hrAdmin))
      .send({ employeeId: employee.employeeId, date: dayOffset(-41), status: 'WEEK_OFF' })
      .expect(201);

    expect(created.body.data.checkIn).toBeNull();
    expect(created.body.data.totalMinutes).toBeNull();
  });
});
