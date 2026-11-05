import type { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { ApiError } from '../../utils/ApiError';
import { addUtcDays, eachUtcDay, minutesBetween, toDateInputValue, toUtcDate, todayUtc } from '../../utils/workdays';
import type { WeeklyTimesheetQuery } from './timesheet.validator';

/** Monday to Friday are full days, Saturday is a 5 hour half day, Sunday is a week off. */
export const WEEKDAY_STANDARD_MINUTES = 8 * 60;
export const SATURDAY_STANDARD_MINUTES = 5 * 60;
export const WEEKLY_TARGET_MINUTES = WEEKDAY_STANDARD_MINUTES * 5 + SATURDAY_STANDARD_MINUTES;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type TimesheetDayKind = AttendanceStatus | 'LEAVE' | 'UNMARKED';

export interface TimesheetDay {
  date: string;
  weekday: string;
  standardMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeMinutes: number;
  status: TimesheetDayKind;
  checkIn: string | null;
  checkOut: string | null;
  holidayName: string | null;
  leaveType: string | null;
  isHoliday: boolean;
  isLeave: boolean;
  isFuture: boolean;
  note: string | null;
}

export interface TimesheetTotals {
  standardMinutes: number;
  targetMinutes: number;
  expectedMinutes: number;
  creditedMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  extraMinutes: number;
  balanceMinutes: number;
  presentDays: number;
  leaveDays: number;
  holidayDays: number;
  absentDays: number;
  unmarkedDays: number;
}

export interface WeeklyTimesheet {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: { id: string; name: string } | null;
    designation: { id: string; name: string } | null;
  };
  days: TimesheetDay[];
  totals: TimesheetTotals;
}

function standardMinutesFor(date: Date): number {
  const weekday = date.getUTCDay();
  if (weekday === 0) return 0;
  if (weekday === 6) return SATURDAY_STANDARD_MINUTES;
  return WEEKDAY_STANDARD_MINUTES;
}

/** Monday 00:00 UTC of the week containing the supplied date. */
export function startOfWeekUtc(value: Date): Date {
  const weekday = value.getUTCDay();
  return addUtcDays(value, -((weekday + 6) % 7));
}

function scopeEmployeeFilter(scope: EmployeeScope, employeeId?: string): Prisma.EmployeeWhereInput {
  if (employeeId) {
    if (scope.mode !== 'all' && !scope.employeeIds?.includes(employeeId)) {
      throw ApiError.forbidden('You are not allowed to access this employee record');
    }
    return { id: employeeId };
  }

  if (scope.mode === 'all') return {};
  return { id: { in: scope.employeeIds ?? [] } };
}

function leaveFraction(totalDays: Prisma.Decimal | number): number {
  const days = Number(totalDays);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(1, days);
}

interface LeaveRow {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: Prisma.Decimal;
  leaveType: { name: string; isPaid: boolean };
}

interface HolidayRow {
  name: string;
  date: Date;
}

interface AttendanceRow {
  employeeId: string;
  date: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  totalMinutes: number | null;
  status: AttendanceStatus;
  notes: string | null;
}

function buildDay(
  date: Date,
  today: Date,
  attendance: AttendanceRow | undefined,
  holiday: HolidayRow | undefined,
  leave: LeaveRow | undefined,
): TimesheetDay {
  const standardMinutes = standardMinutesFor(date);
  const isSunday = date.getUTCDay() === 0;
  const isFuture = date.getTime() > today.getTime();

  const workedMinutes =
    attendance?.totalMinutes ?? minutesBetween(attendance?.checkIn ?? null, attendance?.checkOut ?? null) ?? 0;
  const overtimeMinutes = isSunday
    ? workedMinutes
    : attendance && ['PRESENT', 'LATE', 'HALF_DAY'].includes(attendance.status)
      ? Math.max(0, workedMinutes - standardMinutes)
      : 0;

  let status: TimesheetDayKind = 'UNMARKED';
  let creditedMinutes = 0;
  let leaveType: string | null = null;
  let isLeave = false;
  const isHoliday = Boolean(holiday);

  if (holiday) {
    status = 'HOLIDAY';
    creditedMinutes = standardMinutes;
  } else if (leave && standardMinutes > 0) {
    const fraction = leaveFraction(leave.totalDays);
    leaveType = leave.leaveType.name;
    isLeave = true;
    status = 'LEAVE';
    creditedMinutes = leave.leaveType.isPaid ? Math.round(standardMinutes * fraction) : 0;
  } else if (attendance) {
    status = attendance.status;
    switch (attendance.status) {
      case 'PRESENT':
      case 'LATE':
        creditedMinutes = workedMinutes > 0 ? workedMinutes : standardMinutes;
        break;
      case 'HALF_DAY':
        creditedMinutes = workedMinutes > 0 ? workedMinutes : Math.round(standardMinutes / 2);
        break;
      case 'ON_LEAVE':
        creditedMinutes = standardMinutes;
        isLeave = true;
        break;
      case 'HOLIDAY':
        creditedMinutes = standardMinutes;
        break;
      case 'ABSENT':
      case 'WEEK_OFF':
      default:
        creditedMinutes = 0;
        break;
    }
  } else if (isSunday) {
    status = 'WEEK_OFF';
  }

  return {
    date: toDateInputValue(date),
    weekday: WEEKDAY_LABELS[date.getUTCDay()] ?? '',
    standardMinutes,
    workedMinutes,
    creditedMinutes,
    overtimeMinutes,
    status,
    checkIn: attendance?.checkIn ? attendance.checkIn.toISOString() : null,
    checkOut: attendance?.checkOut ? attendance.checkOut.toISOString() : null,
    holidayName: holiday?.name ?? null,
    leaveType,
    isHoliday,
    isLeave,
    isFuture,
    note: attendance?.notes ?? null,
  };
}

export async function listWeeklyTimesheets(query: WeeklyTimesheetQuery, scope: EmployeeScope) {
  const { page, limit, search, employeeId, departmentId } = query;
  const anchor = query.weekOf ? toUtcDate(query.weekOf) : todayUtc();
  const weekStart = startOfWeekUtc(anchor);
  const weekEnd = addUtcDays(weekStart, 6);
  const weekDays = eachUtcDay(weekStart, weekEnd);
  const today = todayUtc();

  const employeeWhere: Prisma.EmployeeWhereInput = {
    ...scopeEmployeeFilter(scope, employeeId),
    ...(departmentId ? { departmentId } : {}),
    ...(search
      ? {
          OR: [
            { employeeCode: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    status: { not: 'TERMINATED' },
  };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
      orderBy: { employeeCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where: employeeWhere }),
  ]);

  const employeeIds = employees.map((employee) => employee.id);

  const [attendanceRows, holidayRows, leaveRows] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: weekStart, lte: weekEnd } },
      select: {
        employeeId: true,
        date: true,
        checkIn: true,
        checkOut: true,
        totalMinutes: true,
        status: true,
        notes: true,
      },
    }),
    prisma.holiday.findMany({
      where: { isActive: true, date: { gte: weekStart, lte: weekEnd } },
      select: { name: true, date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        leaveType: { select: { name: true, isPaid: true } },
      },
    }),
  ]);

  const attendanceByKey = new Map<string, AttendanceRow>();
  for (const row of attendanceRows) {
    attendanceByKey.set(`${row.employeeId}|${toDateInputValue(row.date)}`, row);
  }

  const holidayByDate = new Map<string, HolidayRow>();
  for (const row of holidayRows) {
    holidayByDate.set(toDateInputValue(row.date), row);
  }

  const leavesByEmployee = new Map<string, LeaveRow[]>();
  for (const row of leaveRows) {
    const bucket = leavesByEmployee.get(row.employeeId) ?? [];
    bucket.push(row);
    leavesByEmployee.set(row.employeeId, bucket);
  }

  const items: WeeklyTimesheet[] = employees.map((employee) => {
    const employeeLeaves = leavesByEmployee.get(employee.id) ?? [];

    const days = weekDays.map((date) => {
      const isoDate = toDateInputValue(date);
      const leave = employeeLeaves.find(
        (request) => request.startDate.getTime() <= date.getTime() && request.endDate.getTime() >= date.getTime(),
      );

      return buildDay(
        date,
        today,
        attendanceByKey.get(`${employee.id}|${isoDate}`),
        holidayByDate.get(isoDate),
        leave,
      );
    });

    const futureStandardMinutes = days
      .filter((day) => day.isFuture)
      .reduce((sum, day) => sum + day.standardMinutes, 0);

    const standardMinutes = days.reduce((sum, day) => sum + day.standardMinutes, 0);
    const creditedMinutes = days.reduce((sum, day) => sum + day.creditedMinutes, 0);
    const workedMinutes = days.reduce((sum, day) => sum + day.workedMinutes, 0);
    const overtimeMinutes = days.reduce((sum, day) => sum + day.overtimeMinutes, 0);
    const expectedMinutes = Math.max(0, WEEKLY_TARGET_MINUTES - futureStandardMinutes);
    const balanceMinutes = creditedMinutes - expectedMinutes;

    const totals: TimesheetTotals = {
      standardMinutes,
      targetMinutes: WEEKLY_TARGET_MINUTES,
      expectedMinutes,
      creditedMinutes,
      workedMinutes,
      overtimeMinutes,
      shortfallMinutes: Math.max(0, expectedMinutes - creditedMinutes),
      extraMinutes: Math.max(0, creditedMinutes - expectedMinutes),
      balanceMinutes,
      presentDays: days.filter((day) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(day.status) && day.workedMinutes > 0)
        .length,
      leaveDays: Number(
        days
          .filter((day) => day.isLeave)
          .reduce((sum, day) => sum + day.creditedMinutes / Math.max(day.standardMinutes, 1), 0)
          .toFixed(2),
      ),
      holidayDays: days.filter((day) => day.isHoliday).length,
      absentDays: days.filter((day) => day.status === 'ABSENT').length,
      unmarkedDays: days.filter((day) => day.status === 'UNMARKED' && !day.isFuture && day.standardMinutes > 0).length,
    };

    return { employee, days, totals };
  });

  return {
    week: {
      start: toDateInputValue(weekStart),
      end: toDateInputValue(weekEnd),
      startDate: toDateInputValue(weekStart),
      endDate: toDateInputValue(weekEnd),
      isCurrentWeek: weekStart.getTime() === startOfWeekUtc(today).getTime(),
      targetMinutes: WEEKLY_TARGET_MINUTES,
      standardMinutes: WEEKLY_TARGET_MINUTES,
    },
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
}
