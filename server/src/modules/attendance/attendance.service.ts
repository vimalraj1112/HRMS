import { AttendanceSource, AuditAction, type AttendanceStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { notifyEmployee } from '../notifications/notifications.service';
import {
  combineDateAndTime,
  countWorkingDays,
  differenceInDays,
  minutesBetween,
  toDateInputValue,
  toUtcDate,
  todayUtc,
} from '../../utils/workdays';
import type {
  AttendanceSummaryQuery,
  CorrectAttendanceBody,
  ListAttendanceQuery,
  MarkAttendanceBody,
} from './attendance.validator';

export interface Actor {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}

const ATTENDANCE_SELECT = {
  id: true,
  employeeId: true,
  date: true,
  checkIn: true,
  checkOut: true,
  totalMinutes: true,
  status: true,
  source: true,
  workFrom: true,
  workTo: true,
  notes: true,
  isCorrected: true,
  correctedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

const SELF_MARKABLE: AttendanceStatus[] = ['PRESENT', 'HALF_DAY', 'LATE'];

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

export async function listAttendance(query: ListAttendanceQuery, scope: EmployeeScope) {
  const { page, limit, search, sortBy, sortOrder, from, to, status, source, employeeId } = query;

  const employees = await prisma.employee.findMany({
    where: {
      ...scopeEmployeeFilter(scope, employeeId),
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: { id: true },
  });

  const employeeIds = employees.map((employee) => employee.id);

  const where: Prisma.AttendanceWhereInput = {
    employeeId: { in: employeeIds },
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: toUtcDate(from) } : {}),
            ...(to ? { lte: toUtcDate(to) } : {}),
          },
        }
      : {}),
    ...(status ? { status: status } : {}),
    ...(source ? { source: source } : {}),
  };

  const primarySort: Prisma.AttendanceOrderByWithRelationInput =
    sortBy === 'status'
      ? { status: sortOrder }
      : sortBy === 'employeeCode'
        ? { employee: { employeeCode: sortOrder } }
        : { date: sortOrder };

  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      select: ATTENDANCE_SELECT,
      orderBy: [primarySort, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.attendance.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function attendanceSummary(query: AttendanceSummaryQuery, scope: EmployeeScope) {
  const { page, limit, month, year, employeeId, departmentId } = query;
  const monthIndex = Number(month) - 1;
  const calendarYear = Number(year);
  const range = {
    gte: new Date(Date.UTC(calendarYear, monthIndex, 1)),
    lt: new Date(Date.UTC(calendarYear, monthIndex + 1, 1)),
  };

  const employeeWhere: Prisma.EmployeeWhereInput = {
    ...scopeEmployeeFilter(scope, employeeId),
    ...(departmentId ? { departmentId } : {}),
    status: { not: 'TERMINATED' },
  };

  const [employees, totalRows] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { employeeCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where: employeeWhere }),
  ]);

  const employeeIds = employees.map((employee) => employee.id);

  const [statusCounts, minuteTotals] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['employeeId', 'status'],
      where: { employeeId: { in: employeeIds }, date: range },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ['employeeId'],
      where: { employeeId: { in: employeeIds }, date: range },
      _sum: { totalMinutes: true },
    }),
  ]);

  const countsByEmployee = new Map<string, Map<AttendanceStatus, number>>();
  for (const entry of statusCounts) {
    const bucket = countsByEmployee.get(entry.employeeId) ?? new Map<AttendanceStatus, number>();
    bucket.set(entry.status, entry._count._all);
    countsByEmployee.set(entry.employeeId, bucket);
  }

  const minutesByEmployee = new Map(
    minuteTotals.map((entry) => [entry.employeeId, entry._sum.totalMinutes ?? 0]),
  );
  const calendarDays = new Date(Date.UTC(calendarYear, monthIndex + 1, 0)).getUTCDate();

  const items = employees.map((employee) => {
    const tally = countsByEmployee.get(employee.id) ?? new Map<AttendanceStatus, number>();
    const count = (status: AttendanceStatus): number => tally.get(status) ?? 0;

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
      present: count('PRESENT'),
      late: count('LATE'),
      halfDay: count('HALF_DAY'),
      absent: count('ABSENT'),
      onLeave: count('ON_LEAVE'),
      holiday: count('HOLIDAY'),
      weekOff: count('WEEK_OFF'),
      calendarDays,
      totalMinutes: minutesByEmployee.get(employee.id) ?? 0,
    };
  });

  return {
    items,
    meta: buildPaginationMeta(page, limit, totalRows),
    year: calendarYear,
    month: Number(month),
  };
}

export async function markAttendance(payload: MarkAttendanceBody, actor: Actor, meta: RequestMeta) {
  const canMarkOthers = hasPermission(actor.role, PERMISSIONS.ATTENDANCE_CORRECT);
  const employeeId = payload.employeeId ?? actor.employeeId;

  if (!employeeId) {
    throw ApiError.unprocessable('Your user account is not linked to an employee record');
  }

  if (employeeId !== actor.employeeId && !canMarkOthers) {
    throw ApiError.forbidden('You can only record your own attendance');
  }

  const date = toUtcDate(payload.date);
  const today = todayUtc();
  const dayOffset = differenceInDays(date, today);

  if (dayOffset > 0) throw ApiError.unprocessable('Attendance cannot be marked for a future date');

  const status = payload.status;

  if (!canMarkOthers) {
    if (dayOffset < 0) throw ApiError.unprocessable('Employees can only mark attendance for today');
    if (!SELF_MARKABLE.includes(status)) {
      throw ApiError.unprocessable('Employees may only mark themselves present, late or on a half day');
    }

    const approvedLeave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: 'APPROVED',
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true },
    });

    if (approvedLeave) {
      throw ApiError.unprocessable('You have approved leave on this date, so attendance cannot be marked');
    }
  }

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    select: { id: true, status: true, checkIn: true, checkOut: true, totalMinutes: true, source: true },
  });

  const checkIn = payload.checkIn ? combineDateAndTime(payload.date, payload.checkIn) : null;
  const checkOut = payload.checkOut ? combineDateAndTime(payload.date, payload.checkOut) : null;
  const totalMinutes = minutesBetween(checkIn, checkOut);
  const isCorrection = existing !== null;

  if (existing && !canMarkOthers) {
    throw ApiError.conflict('Attendance has already been recorded for this date');
  }

  const record = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: {
      employeeId,
      date,
      status,
      checkIn,
      checkOut,
      totalMinutes,
      source: AttendanceSource.MANUAL,
      workFrom: payload.workFrom ?? null,
      workTo: payload.workTo ?? null,
      notes: payload.notes ?? null,
    },
    update: {
      status,
      checkIn,
      checkOut,
      totalMinutes,
      workFrom: payload.workFrom ?? null,
      workTo: payload.workTo ?? null,
      notes: payload.notes ?? null,
      isCorrected: canMarkOthers,
      ...(canMarkOthers ? { correctedById: actor.employeeId, correctedAt: new Date() } : {}),
    },
    select: ATTENDANCE_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: isCorrection ? AuditAction.ATTENDANCE_CORRECTION : AuditAction.ATTENDANCE_CREATE,
    entity: 'Attendance',
    entityId: record.id,
    meta,
    oldValue: existing ? { status: existing.status, checkIn: existing.checkIn, checkOut: existing.checkOut } : null,
    newValue: { status: record.status, checkIn: record.checkIn, checkOut: record.checkOut, date: record.date },
  });

  if (isCorrection && record.employeeId !== actor.employeeId) {
    await notifyEmployee(record.employeeId, {
      type: 'INFO',
      title: 'Attendance recorded for you by HR',
      message: `Your attendance for ${toDateInputValue(record.date)} is ${record.status.replace(/_/g, ' ').toLowerCase()}.`,
      link: '/attendance/my',
      entityType: 'Attendance',
      entityId: record.id,
    });
  }

  return record;
}

export async function correctAttendance(id: string, payload: CorrectAttendanceBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.attendance.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      date: true,
      status: true,
      checkIn: true,
      checkOut: true,
      totalMinutes: true,
      workFrom: true,
      workTo: true,
      notes: true,
    },
  });

  if (!existing) throw ApiError.notFound('Attendance record not found');

  const dateInput = toDateInputValue(existing.date);
  const status = (payload.status) ?? existing.status;

  if (payload.status && ['HOLIDAY', 'WEEK_OFF'].includes(payload.status) && existing.checkIn) {
    throw ApiError.unprocessable('A holiday or week off cannot keep check in and check out times');
  }

  const checkIn =
    payload.checkIn !== undefined
      ? payload.checkIn
        ? combineDateAndTime(dateInput, payload.checkIn)
        : null
      : existing.checkIn;
  const checkOut =
    payload.checkOut !== undefined
      ? payload.checkOut
        ? combineDateAndTime(dateInput, payload.checkOut)
        : null
      : existing.checkOut;

  if (checkIn && checkOut && checkOut <= checkIn) {
    throw ApiError.unprocessable('Check out must be after check in');
  }

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      status,
      checkIn,
      checkOut,
      totalMinutes: minutesBetween(checkIn, checkOut),
      ...(payload.workFrom !== undefined ? { workFrom: payload.workFrom || null } : {}),
      ...(payload.workTo !== undefined ? { workTo: payload.workTo || null } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
      isCorrected: true,
      correctedById: actor.employeeId,
      correctedAt: new Date(),
    },
    select: ATTENDANCE_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ATTENDANCE_CORRECTION,
    entity: 'Attendance',
    entityId: id,
    meta,
    oldValue: { status: existing.status, checkIn: existing.checkIn, checkOut: existing.checkOut, totalMinutes: existing.totalMinutes },
    newValue: { status: record.status, checkIn: record.checkIn, checkOut: record.checkOut, totalMinutes: record.totalMinutes },
  });

  if (actor.employeeId !== existing.employeeId) {
    await notifyEmployee(existing.employeeId, {
      type: 'INFO',
      title: 'Attendance record updated by HR',
      message: `Your attendance for ${dateInput} is now ${record.status.replace(/_/g, ' ').toLowerCase()}.`,
      link: '/attendance/my',
      entityType: 'Attendance',
      entityId: id,
    });
  }

  return record;
}

export async function workingDayCount(startDate: Date, endDate: Date): Promise<number> {
  const holidays = await prisma.holiday.findMany({
    where: { isActive: true, date: { gte: startDate, lte: endDate } },
    select: { date: true },
  });

  return countWorkingDays(startDate, endDate, new Set(holidays.map((holiday) => toDateInputValue(holiday.date))));
}
