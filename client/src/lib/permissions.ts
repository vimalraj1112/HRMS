import type { Role } from '@/types/api';

export type ClientPermission =
  | 'employee:create'
  | 'employee:read:any'
  | 'employee:read:team'
  | 'employee:read:own'
  | 'employee:update'
  | 'employee:status'
  | 'employee:delete'
  | 'department:read'
  | 'department:manage'
  | 'designation:read'
  | 'designation:manage'
  | 'user:read'
  | 'user:manage'
  | 'attendance:mark'
  | 'attendance:read:own'
  | 'attendance:read:team'
  | 'attendance:read:any'
  | 'attendance:correct'
  | 'attendance:import'
  | 'leave:apply'
  | 'leave:read:own'
  | 'leave:read:any'
  | 'leave:approve:manager'
  | 'leave:approve:hr'
  | 'leave:manage'
  | 'leaveType:read'
  | 'leaveType:manage'
  | 'leaveBalance:manage'
  | 'holiday:read'
  | 'holiday:manage'
  | 'salary:read:own'
  | 'salary:read:any'
  | 'salary:manage'
  | 'payroll:read'
  | 'payroll:process'
  | 'payroll:lock'
  | 'payslip:read:own'
  | 'payslip:read:any'
  | 'document:upload'
  | 'document:read:own'
  | 'document:read:any'
  | 'document:verify'
  | 'document:delete'
  | 'goal:manage:own'
  | 'goal:manage:team'
  | 'goal:manage:any'
  | 'review:read:own'
  | 'review:manage:team'
  | 'review:manage:any'
  | 'announcement:read'
  | 'announcement:manage'
  | 'job:manage'
  | 'candidate:manage'
  | 'interview:manage'
  | 'interview:feedback'
  | 'offer:manage'
  | 'reports:hr'
  | 'reports:finance'
  | 'settings:manage';

const SELF_SERVICE: ClientPermission[] = [
  'employee:read:own',
  'attendance:mark',
  'attendance:read:own',
  'leave:apply',
  'leave:read:own',
  'leaveType:read',
  'holiday:read',
  'document:upload',
  'document:read:own',
  'goal:manage:own',
  'review:read:own',
  'announcement:read',
  'salary:read:own',
  'payslip:read:own',
];

const HR_STAFF: ClientPermission[] = [
  ...SELF_SERVICE,
  'employee:create',
  'employee:read:any',
  'employee:update',
  'employee:status',
  'employee:delete',
  'department:read',
  'department:manage',
  'designation:read',
  'designation:manage',
  'user:read',
  'attendance:read:any',
  'attendance:correct',
  'attendance:import',
  'leave:read:any',
  'leave:approve:manager',
  'leave:approve:hr',
  'leave:manage',
  'leaveType:manage',
  'leaveBalance:manage',
  'holiday:manage',
  'salary:read:any',
  'payslip:read:any',
  'document:read:any',
  'document:verify',
  'document:delete',
  'reports:hr',
  'settings:manage',
];

export const ROLE_PERMISSIONS: Record<Role, ClientPermission[]> = {
  SUPER_ADMIN: [
    ...HR_STAFF,
    'employee:read:team',
    'attendance:read:team',
    // The server grants SUPER_ADMIN every permission, so the UI must show them all.
    'user:manage',
    'salary:manage',
    'payroll:read',
    'payroll:process',
    'payroll:lock',
    'reports:finance',
  ],
  HR_ADMIN: HR_STAFF,
  HR_MANAGER: [
    ...SELF_SERVICE,
    'employee:read:any',
    'employee:update',
    'department:read',
    'designation:read',
    'user:read',
    'attendance:read:any',
    'attendance:correct',
    'leave:read:any',
    'leave:approve:manager',
    'leave:approve:hr',
    'document:read:any',
    'reports:hr',
  ],
  MANAGER: [
    ...SELF_SERVICE,
    'employee:read:team',
    'employee:update',
    'department:read',
    'designation:read',
    'attendance:read:team',
    'leave:read:any',
    'leave:approve:manager',
  ],
  FINANCE: [
    ...SELF_SERVICE,
    'employee:read:any',
    'department:read',
    'designation:read',
    'attendance:read:any',
    'salary:read:any',
    'salary:manage',
    'payroll:read',
    'payroll:process',
    'payroll:lock',
    'payslip:read:any',
    'reports:finance',
  ],
  RECRUITER: [
    ...SELF_SERVICE,
    'employee:create',
    'employee:read:any',
    'department:read',
    'designation:read',
  ],
  EMPLOYEE: SELF_SERVICE,
};

/** UI-only guard; the API always re-checks permissions server side. */
export function can(role: Role | undefined, permission: ClientPermission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
