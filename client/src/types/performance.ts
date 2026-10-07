import type { OrgRef, PageQuery } from './hr';

export type GoalType = 'KPI' | 'DEVELOPMENT' | 'PROJECT';
export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ReviewPeriod = 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';

export const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'KPI', label: 'KPI' },
  { value: 'DEVELOPMENT', label: 'Development' },
  { value: 'PROJECT', label: 'Project' },
];

export const GOAL_STATUSES: { value: GoalStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const REVIEW_PERIODS: { value: ReviewPeriod; label: string }[] = [
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half yearly' },
  { value: 'ANNUAL', label: 'Annual' },
];

export const REVIEW_STATUSES: { value: ReviewStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
];

export interface GoalEmployeeRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: OrgRef | null;
}

export interface GoalKpi {
  id: string;
  title: string;
  description: string | null;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  weight: number;
  achieved: boolean;
  updatedAt: string;
}

export interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  type: GoalType;
  status: GoalStatus;
  weight: number;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  employee: GoalEmployeeRef;
  createdBy: { email: string } | null;
  kpis: GoalKpi[];
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerId: string;
  period: ReviewPeriod;
  periodStart: string;
  periodEnd: string;
  selfRating: number | null;
  managerRating: number | null;
  overallRating: number | null;
  status: ReviewStatus;
  achievements: string | null;
  strengths: string | null;
  improvements: string | null;
  managerComments: string | null;
  employeeComments: string | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee: GoalEmployeeRef;
  reviewer: GoalEmployeeRef;
}

export interface GoalListQuery extends PageQuery {
  employeeId?: string;
  status?: GoalStatus;
  type?: GoalType;
  dueBefore?: string;
}

export interface ReviewListQuery extends PageQuery {
  status?: ReviewStatus;
  period?: ReviewPeriod;
  employeeId?: string;
  reviewerId?: string;
}

export interface KpiInput {
  title: string;
  description?: string;
  targetValue: number;
  unit?: string;
  weight?: number;
}

export interface GoalPayload {
  employeeId?: string;
  title: string;
  description?: string;
  type?: GoalType;
  status?: GoalStatus;
  weight?: number;
  progress?: number;
  startDate?: string;
  dueDate?: string;
  kpis?: KpiInput[];
}

export interface GoalPatch {
  title?: string;
  description?: string;
  type?: GoalType;
  status?: GoalStatus;
  weight?: number;
  progress?: number;
  startDate?: string;
  dueDate?: string;
  kpis?: KpiInput[];
  kpiProgress?: { id: string; currentValue: number; achieved?: boolean }[];
}

export interface ReviewPayload {
  employeeId: string;
  reviewerId?: string;
  period?: ReviewPeriod;
  periodStart: string;
  periodEnd: string;
  selfRating?: number;
  managerRating?: number;
  achievements?: string;
  strengths?: string;
  improvements?: string;
  managerComments?: string;
  employeeComments?: string;
}

export interface ReviewPatch {
  reviewerId?: string;
  period?: ReviewPeriod;
  periodStart?: string;
  periodEnd?: string;
  selfRating?: number;
  managerRating?: number;
  achievements?: string;
  strengths?: string;
  improvements?: string;
  managerComments?: string;
  employeeComments?: string;
}
