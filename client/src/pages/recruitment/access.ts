import type { Role } from '@/types/api';

/**
 * `lib/permissions.ts` is a shared, closed list of client permissions, so the
 * recruitment screens gate their buttons on role instead. The API re-checks
 * every request with the real permission set.
 */
const RECRUITMENT_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'];
const OFFER_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'RECRUITER'];
const FEEDBACK_ROLES: Role[] = [...RECRUITMENT_ROLES, 'MANAGER'];

function has(role: Role | undefined, roles: Role[]): boolean {
  return role !== undefined && roles.includes(role);
}

export function canManageJobs(role: Role | undefined): boolean {
  return has(role, RECRUITMENT_ROLES);
}

export function canManageCandidates(role: Role | undefined): boolean {
  return has(role, RECRUITMENT_ROLES);
}

export function canManageInterviews(role: Role | undefined): boolean {
  return has(role, RECRUITMENT_ROLES);
}

export function canSubmitFeedback(role: Role | undefined): boolean {
  return has(role, FEEDBACK_ROLES);
}

export function canManageOffers(role: Role | undefined): boolean {
  return has(role, OFFER_ROLES);
}
