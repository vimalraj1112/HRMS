import type { PageQuery } from './hr';
import type { Role } from './api';

export type AnnouncementAudience = 'ALL' | 'DEPARTMENT' | 'DESIGNATION' | 'ROLE' | 'EMPLOYEE';

export const ANNOUNCEMENT_AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'DEPARTMENT', label: 'A department' },
  { value: 'DESIGNATION', label: 'A designation' },
  { value: 'ROLE', label: 'A role' },
  { value: 'EMPLOYEE', label: 'One employee' },
];

export const ANNOUNCEMENT_ROLES: { value: Role; label: string }[] = [
  { value: 'SUPER_ADMIN', label: 'Super admin' },
  { value: 'HR_ADMIN', label: 'HR admin' },
  { value: 'HR_MANAGER', label: 'HR manager' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

export interface AnnouncementTargetRef {
  id: string;
  name: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  departmentId: string | null;
  designationId: string | null;
  role: Role | null;
  employeeId: string | null;
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  department: AnnouncementTargetRef | null;
  designation: AnnouncementTargetRef | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
  createdBy: { email: string } | null;
  isRead?: boolean;
  readAt?: string | null;
}

export interface AnnouncementListQuery extends PageQuery {
  audience?: AnnouncementAudience;
  pinnedOnly?: boolean;
}

/**
 * Targets are nullable so switching an announcement back to "everyone" can
 * clear them; the server validates that the selected audience has its target.
 */
export interface AnnouncementPayload {
  title: string;
  content: string;
  audience?: AnnouncementAudience;
  departmentId?: string | null;
  designationId?: string | null;
  role?: Role | null;
  employeeId?: string | null;
  isPinned?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
}

export type AnnouncementPatch = Partial<AnnouncementPayload>;
