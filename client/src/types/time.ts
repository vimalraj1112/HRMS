import type { OrgRef, PageQuery } from './hr';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LATE' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEK_OFF';
export type AttendanceSource = 'MANUAL' | 'BIOMETRIC' | 'IMPORT' | 'SYSTEM';
export type LeaveUnit = 'DAYS' | 'HOURS';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ApprovalStage = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
export type HolidayType = 'PUBLIC' | 'OPTIONAL' | 'RESTRICTED';

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'WEEK_OFF', label: 'Week off' },
];

export const SELF_MARKABLE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY'] as const;

export const ATTENDANCE_SOURCES: { value: AttendanceSource; label: string }[] = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'BIOMETRIC', label: 'Biometric' },
  { value: 'IMPORT', label: 'Imported' },
  { value: 'SYSTEM', label: 'System' },
];

export const LEAVE_STATUSES: { value: LeaveRequestStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const HOLIDAY_TYPES: { value: HolidayType; label: string }[] = [
  { value: 'PUBLIC', label: 'Public holiday' },
  { value: 'OPTIONAL', label: 'Optional holiday' },
  { value: 'RESTRICTED', label: 'Restricted holiday' },
];

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalMinutes: number | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  workFrom: string | null;
  workTo: string | null;
  notes: string | null;
  isCorrected: boolean;
  correctedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: OrgRef | null };
}

export interface AttendanceSummaryRow {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: OrgRef | null;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  holiday: number;
  weekOff: number;
  calendarDays: number;
  totalMinutes: number;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  unit: LeaveUnit;
  annualQuota: number;
  isPaid: boolean;
  allowsCarryForward: boolean;
  maxCarryForward: number;
  requiresDocument: boolean;
  minDaysNotice: number;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveApprovalRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  contactDuringLeave: string | null;
  documentKey: string | null;
  status: LeaveRequestStatus;
  appliedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  managerId: string | null;
  managerStage: ApprovalStage;
  managerRemark: string | null;
  managerActionAt: string | null;
  hrApproverId: string | null;
  hrStage: ApprovalStage;
  hrRemark: string | null;
  hrActionAt: string | null;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: OrgRef | null };
  leaveType: { id: string; name: string; code: string; color: string | null; unit: LeaveUnit; annualQuota: number; minDaysNotice: number; isPaid: boolean };
  manager: LeaveApprovalRef | null;
}

export interface LeaveBalance {
  id: string;
  year: number;
  leaveType: {
    id: string;
    name: string;
    code: string;
    color: string | null;
    unit: LeaveUnit;
    isActive: boolean;
  };
  allocated: number;
  used: number;
  pending: number;
  carriedForward: number;
  annualQuota: number;
  available: number;
}

export interface LeaveBalanceAdjustment {
  allocated?: number;
  carriedForward?: number;
  note?: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: HolidayType;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceListQuery extends PageQuery {
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  source?: AttendanceSource;
  employeeId?: string;
}

export interface AttendanceSummaryQuery {
  month: string;
  year: string;
  page?: number;
  limit?: number;
  employeeId?: string;
  departmentId?: string;
}

export interface AttendancePayload {
  employeeId?: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  workFrom?: string;
  workTo?: string;
  notes?: string;
}

export interface AttendanceCorrectionPayload {
  status?: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  workFrom?: string;
  workTo?: string;
  notes?: string;
}

export interface LeaveListQuery extends PageQuery {
  status?: LeaveRequestStatus;
  leaveTypeId?: string;
  from?: string;
  to?: string;
  employeeId?: string;
}

export interface ApplyLeavePayload {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  contactDuringLeave?: string;
}

export interface LeaveDecisionPayload {
  decision: 'APPROVE' | 'REJECT';
  remark?: string;
}

export interface LeaveTypePayload {
  name: string;
  code: string;
  description?: string;
  unit: LeaveUnit;
  annualQuota: number;
  isPaid: boolean;
  allowsCarryForward: boolean;
  maxCarryForward: number;
  requiresDocument: boolean;
  minDaysNotice: number;
  color?: string;
  isActive: boolean;
}

export interface HolidayListQuery extends PageQuery {
  year?: string;
  type?: HolidayType;
  includeInactive?: boolean;
  from?: string;
  to?: string;
}

export interface HolidayPayload {
  name: string;
  date: string;
  type: HolidayType;
  description?: string;
  isActive: boolean;
}
