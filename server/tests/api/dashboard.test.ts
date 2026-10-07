import type { CandidateStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { dashboardRouter } from '../../src/modules/dashboard/dashboard.routes';
import { v1Router } from '../../src/routes';
import { addUtcDays, toDateInputValue, todayUtc } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

// The wiring manifest mounts this router in routes/index.ts; mounting it here too
// keeps the suite runnable before that edit exists and is a no-op afterwards
// (the first matching mount answers the request).
v1Router.use('/dashboard', dashboardRouter);

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const PIPELINE_STATUSES: CandidateStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'OFFERED'];

interface PayrollBlock {
  status: string;
  month: number;
  year: number;
  totalNetSalary?: number;
  employeeCount?: number;
  netSalary?: number;
}

interface DashboardData {
  headcount: { total: number; active: number; newThisMonth: number };
  attendance: { present: number; absent: number; onLeave: number; late: number; total: number; date: string };
  leave: { pendingApprovals: number; approvedThisMonth: number; upcoming: number };
  documents: { pendingVerification: number; expiringSoon: number };
  payroll: PayrollBlock | null;
  announcements: { unread: number; latest: Array<{ id: string; title: string; isRead: boolean }> };
  recruitment: {
    openJobs: number;
    candidatesInPipeline: number;
    interviewsThisWeek: number;
    offersExtended: number;
  };
}

/** Far future period so the fixture never collides with seeded payroll. */
const FIXTURE = { month: 6, year: 2199 };

describe('/api/v1/dashboard', () => {
  let hrAdmin: LoginResult;
  let finance: LoginResult;
  let recruiter: LoginResult;
  let employee: LoginResult;
  let employeeRecordId: string;

  beforeAll(async () => {
    [hrAdmin, finance, recruiter, employee] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.finance),
      login(ACCOUNTS.recruiter),
      login(ACCOUNTS.employee),
    ]);

    employeeRecordId = employee.employeeId ?? '';
    expect(employeeRecordId).not.toBe('');

    await prisma.payrollRun.upsert({
      where: { month_year: { month: FIXTURE.month, year: FIXTURE.year } },
      update: { status: 'PROCESSED', employeeCount: 2, totalNetSalary: 50000 },
      create: { month: FIXTURE.month, year: FIXTURE.year, status: 'PROCESSED', employeeCount: 2, totalNetSalary: 50000 },
    });

    await prisma.payslip.upsert({
      where: {
        employeeId_month_year: { employeeId: employeeRecordId, month: FIXTURE.month, year: FIXTURE.year },
      },
      update: { netSalary: 42000, grossSalary: 45000, status: 'PROCESSED' },
      create: {
        employeeId: employeeRecordId,
        month: FIXTURE.month,
        year: FIXTURE.year,
        basicSalary: 40000,
        grossSalary: 45000,
        totalDeductions: 3000,
        netSalary: 42000,
        status: 'PROCESSED',
      },
    });
  });

  afterAll(async () => {
    await prisma.payslip.deleteMany({
      where: { employeeId: employeeRecordId, month: FIXTURE.month, year: FIXTURE.year },
    });
    await prisma.payrollRun.deleteMany({ where: { month: FIXTURE.month, year: FIXTURE.year } });
  });

  it('requires a session', async () => {
    await request(app).get('/api/v1/dashboard').expect(401);
  });

  it('returns a self scoped overview for an employee', async () => {
    const res = await request(app).get('/api/v1/dashboard').set(bearer(employee)).expect(200);
    const payload = res.body.data as DashboardData;

    expect(payload.headcount.total).toBe(1);
    expect(payload.headcount.active).toBe(1);

    expect(payload.attendance.total).toBe(1);
    expect(payload.attendance.date).toBe(toDateInputValue(todayUtc()));

    expect(payload.leave.pendingApprovals).toBeGreaterThanOrEqual(0);
    expect(payload.leave.approvedThisMonth).toBeGreaterThanOrEqual(0);
    expect(payload.leave.upcoming).toBeGreaterThanOrEqual(0);
    expect(payload.documents.pendingVerification).toBeGreaterThanOrEqual(0);
    expect(payload.documents.expiringSoon).toBeGreaterThanOrEqual(0);

    // A signed in employee sees their own payslip, never the org payroll run.
    expect(payload.payroll).not.toBeNull();
    expect(payload.payroll?.month).toBe(FIXTURE.month);
    expect(payload.payroll?.year).toBe(FIXTURE.year);
    expect(payload.payroll?.status).toBe('PROCESSED');
    expect(payload.payroll?.netSalary).toBe(42000);
    expect(payload.payroll?.employeeCount).toBeUndefined();

    expect(payload.announcements.unread).toBeGreaterThanOrEqual(0);
    expect(payload.announcements.latest.length).toBeLessThanOrEqual(5);
    for (const announcement of payload.announcements.latest) {
      expect(typeof announcement.id).toBe('string');
      expect(typeof announcement.title).toBe('string');
      expect(typeof announcement.isRead).toBe('boolean');
    }

    expect(payload.recruitment).toEqual({
      openJobs: 0,
      candidatesInPipeline: 0,
      interviewsThisWeek: 0,
      offersExtended: 0,
    });
  });

  it('returns organisation totals and the payroll run for HR', async () => {
    const res = await request(app).get('/api/v1/dashboard').set(bearer(hrAdmin)).expect(200);
    const payload = res.body.data as DashboardData;

    const employeeTotal = await prisma.employee.count();
    const activeTotal = await prisma.employee.count({ where: { status: 'ACTIVE' } });
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    expect(payload.headcount.total).toBe(employeeTotal);
    expect(payload.headcount.active).toBe(activeTotal);
    expect(payload.headcount.newThisMonth).toBe(
      await prisma.employee.count({ where: { joiningDate: { gte: monthStart } } }),
    );

    expect(payload.attendance.total).toBe(activeTotal);

    expect(payload.leave.pendingApprovals).toBe(
      await prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    );
    expect(payload.documents.pendingVerification).toBe(
      await prisma.employeeDocument.count({ where: { isVerified: false, deletedAt: null } }),
    );

    expect(payload.payroll?.month).toBe(FIXTURE.month);
    expect(payload.payroll?.year).toBe(FIXTURE.year);
    expect(payload.payroll?.employeeCount).toBe(2);
    expect(payload.payroll?.totalNetSalary).toBe(50000);
    expect(payload.payroll?.netSalary).toBeUndefined();

    const today = todayUtc();
    const expected = {
      openJobs: await prisma.jobOpening.count({ where: { status: 'OPEN' } }),
      candidatesInPipeline: await prisma.candidate.count({ where: { status: { in: PIPELINE_STATUSES } } }),
      interviewsThisWeek: await prisma.interview.count({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: today, lte: new Date(addUtcDays(today, 7).getTime() + 86_399_999) },
        },
      }),
      offersExtended: await prisma.offer.count({ where: { status: 'EXTENDED' } }),
    };
    expect(payload.recruitment).toEqual(expected);
  });

  it('mirrors the payroll run for finance', async () => {
    const res = await request(app).get('/api/v1/dashboard').set(bearer(finance)).expect(200);
    const payload = res.body.data as DashboardData;

    expect(payload.payroll?.employeeCount).toBe(2);
    expect(payload.payroll?.totalNetSalary).toBe(50000);
    expect(payload.payroll?.netSalary).toBeUndefined();

    // Finance does not manage hiring, so recruitment tiles stay zeroed.
    expect(payload.recruitment).toEqual({
      openJobs: 0,
      candidatesInPipeline: 0,
      interviewsThisWeek: 0,
      offersExtended: 0,
    });
  });

  it('shows a recruiter the live recruitment tiles', async () => {
    const res = await request(app).get('/api/v1/dashboard').set(bearer(recruiter)).expect(200);
    const payload = res.body.data as DashboardData;

    const today = todayUtc();
    expect(payload.recruitment).toEqual({
      openJobs: await prisma.jobOpening.count({ where: { status: 'OPEN' } }),
      candidatesInPipeline: await prisma.candidate.count({ where: { status: { in: PIPELINE_STATUSES } } }),
      interviewsThisWeek: await prisma.interview.count({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: today, lte: new Date(addUtcDays(today, 7).getTime() + 86_399_999) },
        },
      }),
      offersExtended: await prisma.offer.count({ where: { status: 'EXTENDED' } }),
    });
  });
});
