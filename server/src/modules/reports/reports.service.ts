import type { EmployeeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { PERMISSIONS, type Permission } from '../../config/rbac';
import { ApiError } from '../../utils/ApiError';
import { addUtcDays, toDateInputValue, toUtcDate, todayUtc } from '../../utils/workdays';
import type { ReportType } from './reports.validator';

const DEFAULT_RANGE_DAYS = 30;

/** Headcount report covers every status the employee table can hold. */
const HEADCOUNT_STATUSES: EmployeeStatus[] = ['ACTIVE', 'ON_NOTICE', 'SUSPENDED', 'RESIGNED', 'TERMINATED'];

export const REPORT_PERMISSIONS: Record<ReportType, Permission> = {
  overview: PERMISSIONS.REPORTS_HR,
  headcount: PERMISSIONS.REPORTS_HR,
  attendance: PERMISSIONS.REPORTS_HR,
  leave: PERMISSIONS.REPORTS_HR,
  payroll: PERMISSIONS.REPORTS_FINANCE,
};

export type ReportRow = Record<string, string | number>;

export interface ReportPayload {
  report: ReportType;
  range?: { from: string; to: string };
  period?: { month: number; year: number };
  summary: Record<string, number>;
  rows: ReportRow[];
}

export interface ReportRange {
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
}

export interface BuildReportInput {
  report: ReportType;
  from?: string;
  to?: string;
  month?: number;
  year?: number;
}

type OverviewRow = { section: string; name: string; total: number; active: number; newThisMonth: number };
type HeadcountRow = { section: string; name: string; total: number; joinedInRange: number; exitedInRange: number };
type AttendanceDayRow = {
  section: string;
  name: string;
  present: number;
  halfDay: number;
  absent: number;
  late: number;
  onLeave: number;
  holiday: number;
  weekOff: number;
  records: number;
};
type LeaveTypeRow = {
  section: string;
  name: string;
  requests: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  days: number;
};
type PayslipRow = { section: string; name: string; gross: number; deductions: number; net: number };

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value === null || value === undefined ? 0 : value.toNumber();

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Defaults to the last 30 days ending today when the caller sends no range. */
export function resolveRange(query: { from?: string; to?: string }): ReportRange {
  const to = query.to ? toUtcDate(query.to) : todayUtc();
  const from = query.from ? toUtcDate(query.from) : addUtcDays(to, -(DEFAULT_RANGE_DAYS - 1));

  if (from.getTime() > to.getTime()) throw ApiError.badRequest('`from` must be on or before `to`');

  return { from, to, fromLabel: toDateInputValue(from), toLabel: toDateInputValue(to) };
}

const inRange = (value: Date, range: ReportRange): boolean =>
  value.getTime() >= range.from.getTime() && value.getTime() <= range.to.getTime();

async function getOverviewReport(range: ReportRange): Promise<ReportPayload> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = todayUtc();

  const [departments, employees, pendingLeaves, attendanceRows] = await Promise.all([
    prisma.department.count({ where: { isActive: true } }),
    prisma.employee.findMany({
      select: { status: true, joiningDate: true, department: { select: { name: true } } },
    }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.attendance.findMany({ where: { date: today }, select: { status: true } }),
  ]);

  const attendanceCounts = new Map<string, number>();
  for (const row of attendanceRows) attendanceCounts.set(row.status, (attendanceCounts.get(row.status) ?? 0) + 1);
  const countOf = (status: string): number => attendanceCounts.get(status) ?? 0;

  const groups = new Map<string, { total: number; active: number; newThisMonth: number }>();
  for (const employee of employees) {
    const name = employee.department?.name ?? 'Unassigned';
    const group = groups.get(name) ?? { total: 0, active: 0, newThisMonth: 0 };
    group.total += 1;
    if (employee.status === 'ACTIVE') group.active += 1;
    if (employee.joiningDate.getTime() >= monthStart.getTime()) group.newThisMonth += 1;
    groups.set(name, group);
  }

  const rows: OverviewRow[] = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, group]) => ({ section: 'Department', name, ...group }));

  return {
    report: 'overview',
    range: { from: range.fromLabel, to: range.toLabel },
    summary: {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((employee) => employee.status === 'ACTIVE').length,
      departments,
      pendingLeaves,
      presentToday: countOf('PRESENT') + countOf('HALF_DAY'),
      lateToday: countOf('LATE'),
      absentToday: countOf('ABSENT'),
      onLeaveToday: countOf('ON_LEAVE'),
    },
    rows,
  };
}

async function getHeadcountReport(range: ReportRange): Promise<ReportPayload> {
  const employees = await prisma.employee.findMany({
    select: { status: true, joiningDate: true, exitDate: true },
  });

  const rows: HeadcountRow[] = HEADCOUNT_STATUSES.map((status) => {
    const matched = employees.filter((employee) => employee.status === status);
    return {
      section: 'Status',
      name: status,
      total: matched.length,
      joinedInRange: matched.filter((employee) => inRange(employee.joiningDate, range)).length,
      exitedInRange: matched.filter(
        (employee) => employee.exitDate !== null && inRange(employee.exitDate, range),
      ).length,
    };
  });

  const summary = { total: 0, active: 0, joinedInRange: 0, exitedInRange: 0 };
  for (const row of rows) {
    summary.total += row.total;
    if (row.name === 'ACTIVE') summary.active = row.total;
    summary.joinedInRange += row.joinedInRange;
    summary.exitedInRange += row.exitedInRange;
  }

  return { report: 'headcount', range: { from: range.fromLabel, to: range.toLabel }, summary, rows };
}

function emptyDay(name: string): AttendanceDayRow {
  return {
    section: 'Attendance',
    name,
    present: 0,
    halfDay: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
    holiday: 0,
    weekOff: 0,
    records: 0,
  };
}

async function getAttendanceReport(range: ReportRange): Promise<ReportPayload> {
  const records = await prisma.attendance.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    select: { date: true, status: true },
  });

  const days = new Map<string, AttendanceDayRow>();
  for (const record of records) {
    const name = toDateInputValue(record.date);
    const day = days.get(name) ?? emptyDay(name);
    if (record.status === 'PRESENT') day.present += 1;
    else if (record.status === 'HALF_DAY') day.halfDay += 1;
    else if (record.status === 'ABSENT') day.absent += 1;
    else if (record.status === 'LATE') day.late += 1;
    else if (record.status === 'ON_LEAVE') day.onLeave += 1;
    else if (record.status === 'HOLIDAY') day.holiday += 1;
    else if (record.status === 'WEEK_OFF') day.weekOff += 1;
    day.records += 1;
    days.set(name, day);
  }

  const rows = [...days.values()].sort((left, right) => left.name.localeCompare(right.name));

  const summary = {
    days: rows.length,
    records: 0,
    present: 0,
    halfDay: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
    holiday: 0,
    weekOff: 0,
  };
  for (const row of rows) {
    summary.records += row.records;
    summary.present += row.present;
    summary.halfDay += row.halfDay;
    summary.absent += row.absent;
    summary.late += row.late;
    summary.onLeave += row.onLeave;
    summary.holiday += row.holiday;
    summary.weekOff += row.weekOff;
  }

  return { report: 'attendance', range: { from: range.fromLabel, to: range.toLabel }, summary, rows };
}

function emptyLeaveType(name: string): LeaveTypeRow {
  return { section: 'Leave', name, requests: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0, days: 0 };
}

async function getLeaveReport(range: ReportRange): Promise<ReportPayload> {
  const requests = await prisma.leaveRequest.findMany({
    where: { startDate: { lte: range.to }, endDate: { gte: range.from } },
    select: { status: true, totalDays: true, leaveType: { select: { name: true } } },
  });

  const types = new Map<string, LeaveTypeRow>();
  for (const request of requests) {
    const name = request.leaveType.name;
    const row = types.get(name) ?? emptyLeaveType(name);
    row.requests += 1;
    if (request.status === 'APPROVED') {
      row.approved += 1;
      row.days += toNumber(request.totalDays);
    } else if (request.status === 'PENDING') row.pending += 1;
    else if (request.status === 'REJECTED') row.rejected += 1;
    else if (request.status === 'CANCELLED') row.cancelled += 1;
    types.set(name, row);
  }

  const rows: LeaveTypeRow[] = [...types.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((row) => ({ ...row, days: round2(row.days) }));

  const summary = { requests: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0, days: 0 };
  for (const row of rows) {
    summary.requests += row.requests;
    summary.approved += row.approved;
    summary.pending += row.pending;
    summary.rejected += row.rejected;
    summary.cancelled += row.cancelled;
    summary.days = round2(summary.days + row.days);
  }

  return { report: 'leave', range: { from: range.fromLabel, to: range.toLabel }, summary, rows };
}

async function getPayrollReport(month: number, year: number): Promise<ReportPayload> {
  const payslips = await prisma.payslip.findMany({
    where: { month, year },
    select: {
      grossSalary: true,
      totalDeductions: true,
      netSalary: true,
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
  });

  const rows: PayslipRow[] = payslips
    .map((payslip) => ({
      section: 'Payslip',
      name: `${payslip.employee.employeeCode} - ${payslip.employee.firstName} ${payslip.employee.lastName}`,
      gross: round2(toNumber(payslip.grossSalary)),
      deductions: round2(toNumber(payslip.totalDeductions)),
      net: round2(toNumber(payslip.netSalary)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const summary = { payslips: 0, totalGross: 0, totalDeductions: 0, totalNet: 0 };
  for (const row of rows) {
    summary.payslips += 1;
    summary.totalGross = round2(summary.totalGross + row.gross);
    summary.totalDeductions = round2(summary.totalDeductions + row.deductions);
    summary.totalNet = round2(summary.totalNet + row.net);
  }

  return { report: 'payroll', period: { month, year }, summary, rows };
}

export async function buildReport(input: BuildReportInput): Promise<ReportPayload> {
  if (input.report === 'payroll') {
    if (input.month === undefined || input.year === undefined) {
      throw ApiError.badRequest('`month` and `year` are required for the payroll report');
    }
    return getPayrollReport(input.month, input.year);
  }

  const range = resolveRange(input);

  if (input.report === 'overview') return getOverviewReport(range);
  if (input.report === 'headcount') return getHeadcountReport(range);
  if (input.report === 'attendance') return getAttendanceReport(range);
  return getLeaveReport(range);
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 BOM so Excel opens accents correctly, CRLF line endings per RFC 4180. */
export function toCsv(payload: ReportPayload): string {
  if (payload.rows.length === 0) return '\uFEFF';

  const headers = [...new Set(payload.rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of payload.rows) lines.push(headers.map((header) => escapeCsvCell(row[header] ?? '')).join(','));

  return `\uFEFF${lines.join('\r\n')}`;
}

export function csvFilename(payload: ReportPayload): string {
  if (payload.period) {
    return `${payload.report}-${payload.period.year}-${String(payload.period.month).padStart(2, '0')}.csv`;
  }
  if (payload.range) return `${payload.report}-${payload.range.from}_${payload.range.to}.csv`;
  return `${payload.report}.csv`;
}
