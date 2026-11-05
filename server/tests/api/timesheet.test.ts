import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { addUtcDays, startOfUtcDay, toDateInputValue } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const TEST_WEEK_START = '2025-02-03'; // Monday, outside the seeded 30 day attendance window.
const TEST_EMPLOYEE_EMAIL = ACCOUNTS.employee.email;
const TEST_HOLIDAY_NAME = 'Timesheet test holiday';

interface DayRow {
  date: string;
  weekday: string;
  standardMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeMinutes: number;
  status: string;
  isHoliday: boolean;
  isLeave: boolean;
  holidayName: string | null;
  leaveType: string | null;
}

interface SheetRow {
  employee: { id: string; employeeCode: string };
  days: DayRow[];
  totals: {
    standardMinutes: number;
    targetMinutes: number;
    expectedMinutes: number;
    creditedMinutes: number;
    workedMinutes: number;
    overtimeMinutes: number;
    shortfallMinutes: number;
    extraMinutes: number;
    presentDays: number;
    leaveDays: number;
    holidayDays: number;
    absentDays: number;
    unmarkedDays: number;
  };
}

const dateAt = (iso: string, hour: number, minute = 0): Date =>
  new Date(`${iso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);

describe('/api/v1/timesheets', () => {
  let hrAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;
  let employeeId: string;
  let leaveTypeId: string;

  beforeAll(async () => {
    [hrAdmin, manager, employee] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
    ]);

    const record = await prisma.employee.findFirstOrThrow({
      where: { user: { email: TEST_EMPLOYEE_EMAIL } },
      select: { id: true },
    });
    employeeId = record.id;

    const leaveType = await prisma.leaveType.findFirstOrThrow({
      where: { isPaid: true, isActive: true },
      select: { id: true },
    });
    leaveTypeId = leaveType.id;

    const monday = new Date(`${TEST_WEEK_START}T00:00:00.000Z`);
    const dates = {
      monday: TEST_WEEK_START,
      tuesday: toDateInputValue(addUtcDays(monday, 1)),
      wednesday: toDateInputValue(addUtcDays(monday, 2)),
      thursday: toDateInputValue(addUtcDays(monday, 3)),
      saturday: toDateInputValue(addUtcDays(monday, 5)),
    };

    await prisma.attendance.deleteMany({
      where: { employeeId, date: { gte: monday, lte: addUtcDays(monday, 6) } },
    });

    await prisma.attendance.createMany({
      data: [
        {
          employeeId,
          date: new Date(`${dates.monday}T00:00:00.000Z`),
          checkIn: dateAt(dates.monday, 9),
          checkOut: dateAt(dates.monday, 18),
          totalMinutes: 540,
          status: 'PRESENT',
          source: 'MANUAL',
        },
        {
          employeeId,
          date: new Date(`${dates.tuesday}T00:00:00.000Z`),
          status: 'ABSENT',
          source: 'MANUAL',
        },
        {
          employeeId,
          date: new Date(`${dates.saturday}T00:00:00.000Z`),
          checkIn: dateAt(dates.saturday, 9),
          checkOut: dateAt(dates.saturday, 14),
          totalMinutes: 300,
          status: 'PRESENT',
          source: 'MANUAL',
        },
      ],
    });

    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(`${dates.wednesday}T00:00:00.000Z`),
        endDate: new Date(`${dates.wednesday}T00:00:00.000Z`),
        totalDays: 1,
        reason: 'Timesheet fixture',
        status: 'APPROVED',
      },
    });

    await prisma.holiday.create({
      data: {
        name: TEST_HOLIDAY_NAME,
        date: new Date(`${dates.thursday}T00:00:00.000Z`),
        type: 'PUBLIC',
      },
    });
  });

  afterAll(async () => {
    const monday = new Date(`${TEST_WEEK_START}T00:00:00.000Z`);
    await prisma.attendance.deleteMany({
      where: { employeeId, date: { gte: monday, lte: addUtcDays(monday, 6) } },
    });
    await prisma.leaveRequest.deleteMany({
      where: { employeeId, reason: 'Timesheet fixture' },
    });
    await prisma.holiday.deleteMany({ where: { name: TEST_HOLIDAY_NAME } });
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/timesheets/week').expect(401);
  });

  it('rejects an invalid week date', async () => {
    await request(app)
      .get('/api/v1/timesheets/week?weekOf=03-02-2025')
      .set(bearer(employee))
      .expect(400);
  });

  it('returns only the caller sheet for an employee', async () => {
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}`)
      .set(bearer(employee))
      .expect(200);

    const items = response.body.data.items as SheetRow[];
    expect(items).toHaveLength(1);
    expect(items[0]?.employee.id).toBe(employee.employeeId);
  });

  it('forbids an employee from reading another employee', async () => {
    await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}&employeeId=${hrAdmin.employeeId}`)
      .set(bearer(employee))
      .expect(403);
  });

  it('limits a manager to their own team', async () => {
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}&limit=100`)
      .set(bearer(manager))
      .expect(200);

    const items = response.body.data.items as SheetRow[];
    const ids = new Set(items.map((item) => item.employee.id));
    expect(ids.has(manager.employeeId as string)).toBe(true);
    expect(ids.has(employee.employeeId as string)).toBe(true);
    expect(ids.has(hrAdmin.employeeId as string)).toBe(false);
  });

  it('builds a Monday to Sunday week with a 45 hour target', async () => {
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}`)
      .set(bearer(employee))
      .expect(200);

    const sheet = (response.body.data.items as SheetRow[])[0];
    expect(sheet).toBeTruthy();
    if (!sheet) return;

    expect(sheet.days.map((day) => day.weekday)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(sheet.days.map((day) => day.standardMinutes)).toEqual([480, 480, 480, 480, 480, 300, 0]);
    expect(sheet.totals.targetMinutes).toBe(2700);
    expect(sheet.totals.standardMinutes).toBe(2700);
    expect(response.body.data.week.start).toBe(TEST_WEEK_START);
    expect(response.body.data.week.end).toBe(toDateInputValue(addUtcDays(new Date(`${TEST_WEEK_START}T00:00:00.000Z`), 6)));
  });

  it('credits worked hours, paid leave and holidays, and counts overtime', async () => {
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}`)
      .set(bearer(employee))
      .expect(200);

    const sheet = (response.body.data.items as SheetRow[])[0];
    expect(sheet).toBeTruthy();
    if (!sheet) return;

    const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = sheet.days as [
      DayRow,
      DayRow,
      DayRow,
      DayRow,
      DayRow,
      DayRow,
      DayRow,
    ];

    expect(monday.status).toBe('PRESENT');
    expect(monday.creditedMinutes).toBe(540);
    expect(monday.overtimeMinutes).toBe(60);

    expect(tuesday.status).toBe('ABSENT');
    expect(tuesday.creditedMinutes).toBe(0);

    expect(wednesday.isLeave).toBe(true);
    expect(wednesday.creditedMinutes).toBe(480);
    expect(wednesday.leaveType).toBeTruthy();

    expect(thursday.isHoliday).toBe(true);
    expect(thursday.holidayName).toBe(TEST_HOLIDAY_NAME);
    expect(thursday.creditedMinutes).toBe(480);

    expect(friday.status).toBe('UNMARKED');
    expect(friday.creditedMinutes).toBe(0);

    expect(saturday.standardMinutes).toBe(300);
    expect(saturday.creditedMinutes).toBe(300);
    expect(saturday.overtimeMinutes).toBe(0);

    expect(sunday.standardMinutes).toBe(0);
    expect(sunday.creditedMinutes).toBe(0);

    expect(sheet.totals.creditedMinutes).toBe(540 + 0 + 480 + 480 + 0 + 300 + 0);
    expect(sheet.totals.workedMinutes).toBe(840);
    expect(sheet.totals.overtimeMinutes).toBe(60);
    expect(sheet.totals.shortfallMinutes).toBe(900);
    expect(sheet.totals.presentDays).toBe(2);
    expect(sheet.totals.leaveDays).toBe(1);
    expect(sheet.totals.holidayDays).toBe(1);
    expect(sheet.totals.absentDays).toBe(1);
    expect(sheet.totals.unmarkedDays).toBe(1);
  });

  it('lets HR read every employee for the week', async () => {
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${TEST_WEEK_START}&limit=100`)
      .set(bearer(hrAdmin))
      .expect(200);

    const items = response.body.data.items as SheetRow[];
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]?.days).toHaveLength(7);
    expect(response.body.data.meta.total).toBe(items.length);
  });

  it('caps the expected hours of the current week at the days that have passed', async () => {
    const today = startOfUtcDay(new Date());
    const response = await request(app)
      .get(`/api/v1/timesheets/week?weekOf=${toDateInputValue(today)}`)
      .set(bearer(employee))
      .expect(200);

    const sheet = (response.body.data.items as SheetRow[])[0];
    expect(sheet).toBeTruthy();
    if (!sheet) return;

    const remaining = sheet.days
      .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getTime() > today.getTime())
      .reduce((sum, day) => sum + day.standardMinutes, 0);
    expect(sheet.totals.expectedMinutes).toBe(Math.max(0, 2700 - remaining));
  });
});
