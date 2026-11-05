import type { ApiMeta } from './api';
import type { OrgRef } from './hr';

export type TimesheetDayStatus =
  | 'PRESENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'LEAVE'
  | 'UNMARKED';

export interface TimesheetDay {
  date: string;
  weekday: string;
  standardMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeMinutes: number;
  status: TimesheetDayStatus;
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

export interface TimesheetEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: OrgRef | null;
  designation: OrgRef | null;
}

export interface WeeklyTimesheet {
  employee: TimesheetEmployee;
  days: TimesheetDay[];
  totals: TimesheetTotals;
}

export interface TimesheetWeek {
  start: string;
  end: string;
  isCurrentWeek: boolean;
  targetMinutes: number;
  standardMinutes: number;
}

export interface WeeklyTimesheetQuery {
  weekOf?: string;
  employeeId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface WeeklyTimesheetResult {
  week: TimesheetWeek;
  items: WeeklyTimesheet[];
  meta: ApiMeta;
}
