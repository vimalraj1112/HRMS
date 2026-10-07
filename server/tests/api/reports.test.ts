import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { reportsRouter } from '../../src/modules/reports/reports.routes';
import { v1Router } from '../../src/routes';
import { addUtcDays, toDateInputValue, toUtcDate, todayUtc } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

// The wiring manifest mounts this router in routes/index.ts; mounting it here too
// keeps the suite runnable before that edit exists and is a no-op afterwards
// (the first matching mount answers the request).
v1Router.use('/reports', reportsRouter);

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

interface ReportPayload {
  report: string;
  range?: { from: string; to: string };
  period?: { month: number; year: number };
  summary: Record<string, number>;
  rows: Array<Record<string, string | number>>;
}

/** Far future period so the fixture never collides with seeded payroll. */
const FIXTURE = { month: 6, year: 2199 };

describe('/api/v1/reports', () => {
  let superAdmin: LoginResult;
  let hrAdmin: LoginResult;
  let hrManager: LoginResult;
  let finance: LoginResult;
  let employee: LoginResult;
  let fixtureEmployeeId: string;
  let fixtureEmployeeName: string;

  beforeAll(async () => {
    [superAdmin, hrAdmin, hrManager, finance, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.hrManager),
      login(ACCOUNTS.finance),
      login(ACCOUNTS.employee),
    ]);

    const target = await prisma.employee.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    expect(target).not.toBeNull();
    if (!target) return;

    fixtureEmployeeId = target.id;
    fixtureEmployeeName = `${target.employeeCode} - ${target.firstName} ${target.lastName}`;

    await prisma.payslip.upsert({
      where: { employeeId_month_year: { employeeId: fixtureEmployeeId, month: FIXTURE.month, year: FIXTURE.year } },
      update: { grossSalary: 60000, totalDeductions: 5000, netSalary: 55000, status: 'PROCESSED' },
      create: {
        employeeId: fixtureEmployeeId,
        month: FIXTURE.month,
        year: FIXTURE.year,
        basicSalary: 50000,
        grossSalary: 60000,
        totalDeductions: 5000,
        netSalary: 55000,
        status: 'PROCESSED',
      },
    });
  });

  afterAll(async () => {
    if (!fixtureEmployeeId) return;
    await prisma.payslip.deleteMany({
      where: { employeeId: fixtureEmployeeId, month: FIXTURE.month, year: FIXTURE.year },
    });
  });

  it('requires the matching report permission per route', async () => {
    await request(app).get('/api/v1/reports/overview').expect(401);
    await request(app).get('/api/v1/reports/overview').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/reports/overview').set(bearer(finance)).expect(403);
    await request(app).get('/api/v1/reports/overview').set(bearer(hrAdmin)).expect(200);
    await request(app).get('/api/v1/reports/headcount').set(bearer(hrManager)).expect(200);
    await request(app).get('/api/v1/reports/attendance').set(bearer(hrManager)).expect(200);
    await request(app).get('/api/v1/reports/leave').set(bearer(hrManager)).expect(200);

    await request(app).get('/api/v1/reports/payroll').set(bearer(hrAdmin)).expect(403);
    await request(app).get('/api/v1/reports/payroll').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/reports/payroll?month=6&year=2199').set(bearer(finance)).expect(200);
  });

  it('builds the overview report over the default 30 day window', async () => {
    const res = await request(app).get('/api/v1/reports/overview').set(bearer(hrAdmin)).expect(200);
    const payload = res.body.data as ReportPayload;

    expect(payload.report).toBe('overview');
    expect(payload.range?.from).toBe(toDateInputValue(addUtcDays(todayUtc(), -29)));
    expect(payload.range?.to).toBe(toDateInputValue(todayUtc()));

    expect(payload.summary.totalEmployees).toBe(await prisma.employee.count());
    expect(payload.summary.activeEmployees).toBe(await prisma.employee.count({ where: { status: 'ACTIVE' } }));
    expect(payload.summary.departments).toBe(await prisma.department.count({ where: { isActive: true } }));
    expect(payload.summary.pendingLeaves).toBe(await prisma.leaveRequest.count({ where: { status: 'PENDING' } }));

    const todayRows = await prisma.attendance.findMany({ where: { date: todayUtc() }, select: { status: true } });
    const present = todayRows.filter((row) => row.status === 'PRESENT' || row.status === 'HALF_DAY').length;
    expect(payload.summary.presentToday).toBe(present);
    expect(payload.summary.lateToday).toBe(todayRows.filter((row) => row.status === 'LATE').length);
    expect(payload.summary.absentToday).toBe(todayRows.filter((row) => row.status === 'ABSENT').length);
    expect(payload.summary.onLeaveToday).toBe(todayRows.filter((row) => row.status === 'ON_LEAVE').length);

    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows.every((row) => row.section === 'Department')).toBe(true);
  });

  it('validates ranges before building a report', async () => {
    await request(app).get('/api/v1/reports/overview').query({ from: '2026-02-10', to: '2026-02-01' }).set(bearer(hrAdmin)).expect(400);
    await request(app).get('/api/v1/reports/overview').query({ from: '2026-02-30' }).set(bearer(hrAdmin)).expect(400);
    await request(app).get('/api/v1/reports/overview').query({ from: 'not-a-date' }).set(bearer(hrAdmin)).expect(400);

    const res = await request(app)
      .get('/api/v1/reports/overview')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .set(bearer(hrAdmin))
      .expect(200);
    const payload = res.body.data as ReportPayload;
    expect(payload.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('breaks headcount down by employee status', async () => {
    const res = await request(app).get('/api/v1/reports/headcount').set(bearer(hrAdmin)).expect(200);
    const payload = res.body.data as ReportPayload;

    expect(payload.report).toBe('headcount');
    expect(payload.rows.length).toBe(5);
    expect(payload.rows.every((row) => row.section === 'Status')).toBe(true);

    expect(payload.summary.total).toBe(await prisma.employee.count());
    expect(payload.summary.active).toBe(await prisma.employee.count({ where: { status: 'ACTIVE' } }));

    const from = addUtcDays(todayUtc(), -29);
    const to = todayUtc();
    expect(payload.summary.joinedInRange).toBe(
      await prisma.employee.count({ where: { joiningDate: { gte: from, lte: to } } }),
    );
    expect(payload.summary.exitedInRange).toBe(
      await prisma.employee.count({ where: { exitDate: { gte: from, lte: to } } }),
    );
  });

  it('rolls attendance up per day inside the requested range', async () => {
    const query = { from: '2026-01-01', to: '2026-01-31' };
    const res = await request(app)
      .get('/api/v1/reports/attendance')
      .query(query)
      .set(bearer(hrAdmin))
      .expect(200);
    const payload = res.body.data as ReportPayload;

    expect(payload.report).toBe('attendance');
    expect(payload.summary.days).toBe(payload.rows.length);
    expect(payload.summary.records).toBe(
      await prisma.attendance.count({
        where: { date: { gte: toUtcDate(query.from), lte: toUtcDate(query.to) } },
      }),
    );

    const names = payload.rows.map((row) => String(row.name));
    expect(names).toEqual([...names].sort());
    expect(payload.rows.every((row) => row.section === 'Attendance')).toBe(true);
  });

  it('groups leave requests by leave type', async () => {
    const query = { from: '2026-01-01', to: '2026-12-31' };
    const res = await request(app).get('/api/v1/reports/leave').query(query).set(bearer(hrAdmin)).expect(200);
    const payload = res.body.data as ReportPayload;

    expect(payload.report).toBe('leave');
    expect(payload.summary.requests).toBe(
      await prisma.leaveRequest.count({
        where: { startDate: { lte: toUtcDate(query.to) }, endDate: { gte: toUtcDate(query.from) } },
      }),
    );
    const statusTotal = (['approved', 'pending', 'rejected', 'cancelled'] as const).reduce(
      (total, key) => total + (payload.summary[key] ?? 0),
      0,
    );
    expect(statusTotal).toBeLessThanOrEqual(payload.summary.requests ?? 0);
    expect(payload.rows.every((row) => row.section === 'Leave')).toBe(true);
  });

  it('totals payslips for the payroll period', async () => {
    const res = await request(app)
      .get('/api/v1/reports/payroll')
      .query({ month: FIXTURE.month, year: FIXTURE.year })
      .set(bearer(finance))
      .expect(200);
    const payload = res.body.data as ReportPayload;

    expect(payload.report).toBe('payroll');
    expect(payload.period).toEqual({ month: FIXTURE.month, year: FIXTURE.year });

    const expectedPayslips = await prisma.payslip.count({
      where: { month: FIXTURE.month, year: FIXTURE.year },
    });
    expect(payload.summary.payslips).toBe(expectedPayslips);
    expect(expectedPayslips).toBeGreaterThan(0);

    const fixtureRow = payload.rows.find((row) => row.name === fixtureEmployeeName);
    expect(fixtureRow).toBeDefined();
    expect(fixtureRow?.gross).toBe(60000);
    expect(fixtureRow?.deductions).toBe(5000);
    expect(fixtureRow?.net).toBe(55000);
    expect(payload.summary.totalNet).toBeGreaterThanOrEqual(55000);
  });

  it('validates the payroll period', async () => {
    await request(app).get('/api/v1/reports/payroll').set(bearer(finance)).expect(400);
    await request(app).get('/api/v1/reports/payroll?month=13&year=2199').set(bearer(finance)).expect(400);
    await request(app).get('/api/v1/reports/payroll?month=6&year=1999').set(bearer(finance)).expect(400);
  });

  it('streams a CSV export and audits it', async () => {
    const csv = await request(app).get('/api/v1/reports/export').set(bearer(hrAdmin)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(
      /^attachment; filename="overview-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const text = csv.text ?? '';
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('section');
    expect(text.split('\r\n').length).toBeGreaterThanOrEqual(2);

    const audit = await request(app)
      .get('/api/v1/audit-logs?action=REPORT_EXPORT&limit=20')
      .set(bearer(superAdmin))
      .expect(200);
    const rows = audit.body.data as Array<{ action: string; userEmail: string | null; entityId: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.userEmail === ACCOUNTS.hrAdmin.email && row.entityId === 'overview')).toBe(true);
  });

  it('enforces the per report permission on export', async () => {
    await request(app).get('/api/v1/reports/export').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/reports/export').set(bearer(finance)).expect(403);
    await request(app).get('/api/v1/reports/export?report=payroll').set(bearer(hrAdmin)).expect(400);
    await request(app)
      .get('/api/v1/reports/export')
      .query({ report: 'payroll', month: FIXTURE.month, year: FIXTURE.year })
      .set(bearer(hrAdmin))
      .expect(403);
    await request(app).get('/api/v1/reports/export?report=bogus').set(bearer(hrAdmin)).expect(400);

    const csv = await request(app)
      .get('/api/v1/reports/export')
      .query({ report: 'payroll', month: FIXTURE.month, year: FIXTURE.year })
      .set(bearer(finance))
      .expect(200);
    expect(csv.headers['content-disposition']).toContain(`payroll-${FIXTURE.year}-06.csv`);
  });

  it('returns JSON when explicitly requested', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?report=headcount&format=json')
      .set(bearer(hrAdmin))
      .expect(200);
    const payload = res.body.data as ReportPayload;
    expect(payload.report).toBe('headcount');
    expect(Array.isArray(payload.rows)).toBe(true);
  });
});
