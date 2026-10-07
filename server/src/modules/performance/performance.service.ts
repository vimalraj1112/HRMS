import { AuditAction, type GoalStatus, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import { assertEmployeeAccess, resolveEmployeeScope, type EmployeeScope } from '../../middleware/rbac.middleware';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { toUtcDate } from '../../utils/workdays';
import { notifyEmployee } from '../notifications/notifications.service';
import type { Actor } from '../leave/leave.service';
import type {
  AcknowledgeReviewBody,
  CreateGoalBody,
  CreateReviewBody,
  ListGoalsQuery,
  ListReviewsQuery,
  SubmitReviewBody,
  UpdateGoalBody,
  UpdateReviewBody,
} from './performance.validator';

const GOAL_SELECT = {
  id: true,
  employeeId: true,
  title: true,
  description: true,
  type: true,
  status: true,
  weight: true,
  progress: true,
  startDate: true,
  dueDate: true,
  completedAt: true,
  createdById: true,
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
  createdBy: { select: { email: true } },
  kpis: {
    select: {
      id: true,
      title: true,
      description: true,
      targetValue: true,
      currentValue: true,
      unit: true,
      weight: true,
      achieved: true,
      updatedAt: true,
    },
  },
} as const;

const REVIEW_SELECT = {
  id: true,
  employeeId: true,
  reviewerId: true,
  period: true,
  periodStart: true,
  periodEnd: true,
  selfRating: true,
  managerRating: true,
  overallRating: true,
  status: true,
  achievements: true,
  strengths: true,
  improvements: true,
  managerComments: true,
  employeeComments: true,
  submittedAt: true,
  acknowledgedAt: true,
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
  reviewer: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

type GoalRecord = Prisma.GoalGetPayload<{ select: typeof GOAL_SELECT }>;
type ReviewRecord = Prisma.PerformanceReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

const toNumber = (value: Prisma.Decimal | null | undefined): number | null =>
  value === null || value === undefined ? null : value.toNumber();

function serializeGoal(goal: GoalRecord) {
  return {
    ...goal,
    startDate: goal.startDate ? goal.startDate.toISOString().slice(0, 10) : null,
    dueDate: goal.dueDate ? goal.dueDate.toISOString().slice(0, 10) : null,
    kpis: goal.kpis.map((kpi) => ({
      ...kpi,
      targetValue: kpi.targetValue.toNumber(),
      currentValue: kpi.currentValue.toNumber(),
    })),
  };
}

function serializeReview(review: ReviewRecord) {
  return {
    ...review,
    periodStart: review.periodStart.toISOString().slice(0, 10),
    periodEnd: review.periodEnd.toISOString().slice(0, 10),
    selfRating: toNumber(review.selfRating),
    managerRating: toNumber(review.managerRating),
    overallRating: toNumber(review.overallRating),
  };
}

function assertDateOrder(startDate: string | undefined, dueDate: string | undefined): void {
  if (!startDate || !dueDate) return;
  if (toUtcDate(startDate).getTime() > toUtcDate(dueDate).getTime()) {
    throw ApiError.unprocessable('startDate must be on or before dueDate', [
      { field: 'dueDate', message: 'Due date cannot be before the start date' },
    ]);
  }
}

function assertPeriodOrder(periodStart: string, periodEnd: string): void {
  if (toUtcDate(periodStart).getTime() >= toUtcDate(periodEnd).getTime()) {
    throw ApiError.unprocessable('periodStart must be before periodEnd', [
      { field: 'periodEnd', message: 'Period end must be after the period start' },
    ]);
  }
}

/** KPI weights share the goal's 100 point budget, so a set may never exceed it. */
function assertKpiWeights(kpis: { weight?: number }[] | undefined): void {
  if (!kpis?.length) return;
  const total = kpis.reduce((sum, kpi) => sum + (kpi.weight ?? 0), 0);
  if (total > 100) {
    throw ApiError.unprocessable('KPI weights may add up to at most 100', [
      { field: 'kpis', message: `KPI weights add up to ${total}` },
    ]);
  }
}

function goalOrderBy(sortBy: string | undefined, sortOrder: 'asc' | 'desc'): Prisma.GoalOrderByWithRelationInput {
  switch (sortBy) {
    case 'title':
      return { title: sortOrder };
    case 'dueDate':
      return { dueDate: sortOrder };
    case 'startDate':
      return { startDate: sortOrder };
    case 'progress':
      return { progress: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'weight':
      return { weight: sortOrder };
    case 'updatedAt':
      return { updatedAt: sortOrder };
    default:
      return { createdAt: sortOrder };
  }
}

function reviewOrderBy(sortBy: string | undefined, sortOrder: 'asc' | 'desc'): Prisma.PerformanceReviewOrderByWithRelationInput {
  switch (sortBy) {
    case 'periodEnd':
      return { periodEnd: sortOrder };
    case 'periodStart':
      return { periodStart: sortOrder };
    case 'overallRating':
      return { overallRating: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'updatedAt':
      return { updatedAt: sortOrder };
    default:
      return { createdAt: sortOrder };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The manager's rating carries 70% and the self rating 30%. When only one side
 * is filled in it becomes the overall rating on its own; with neither there is
 * no rating to report.
 */
function computeOverallRating(selfRating: number | null, managerRating: number | null): number | null {
  if (selfRating !== null && managerRating !== null) return round2(managerRating * 0.7 + selfRating * 0.3);
  return managerRating ?? selfRating ?? null;
}

// ── Scope ─────────────────────────────────────────────────────

/**
 * Who may see which goals: `goal:manage:any` sees everything,
 * `goal:manage:team` sees own goals plus direct reports, and everybody else
 * only their own goals.
 */
export async function resolveGoalScope(req: Request): Promise<EmployeeScope> {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  if (hasPermission(user.role, PERMISSIONS.GOAL_MANAGE_ANY)) return { mode: 'all', employeeIds: null };

  if (hasPermission(user.role, PERMISSIONS.GOAL_MANAGE_TEAM)) {
    const scope = await resolveEmployeeScope(req);
    if (scope.mode !== 'all') return scope;

    // A wider employee read scope must not widen goal access: clamp to own + reports.
    const reports = await prisma.employee.findMany({
      where: { managerId: user.employeeId, status: { not: 'TERMINATED' } },
      select: { id: true },
    });
    return {
      mode: 'team',
      employeeIds: [...(user.employeeId ? [user.employeeId] : []), ...reports.map((report) => report.id)],
    };
  }

  return { mode: 'self', employeeIds: user.employeeId ? [user.employeeId] : [] };
}

// ── Goals ─────────────────────────────────────────────────────

export async function listGoals(query: ListGoalsQuery, scope: EmployeeScope) {
  const where: Prisma.GoalWhereInput = {
    ...(scope.mode === 'all' ? {} : { employeeId: { in: scope.employeeIds ?? [] } }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.dueBefore ? { dueDate: { lte: toUtcDate(query.dueBefore) } } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.goal.findMany({
      where,
      select: GOAL_SELECT,
      orderBy: goalOrderBy(query.sortBy, query.sortOrder),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.goal.count({ where }),
  ]);

  return {
    items: items.map((goal) => serializeGoal(goal)),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getGoal(id: string, scope: EmployeeScope) {
  const goal = await prisma.goal.findUnique({ where: { id }, select: GOAL_SELECT });
  if (!goal) throw ApiError.notFound('Goal not found');

  assertEmployeeAccess(scope, goal.employeeId);
  return serializeGoal(goal);
}

export async function createGoal(
  body: CreateGoalBody,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  const employeeId = body.employeeId ?? actor.employeeId;
  if (!employeeId) {
    throw ApiError.unprocessable('An employeeId is required because this account is not linked to an employee');
  }

  // Creating for yourself is always allowed; creating for anybody else needs a
  // scope that contains them, which only team/any goal permissions grant.
  assertEmployeeAccess(scope, employeeId);
  assertDateOrder(body.startDate, body.dueDate);
  assertKpiWeights(body.kpis);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) throw ApiError.unprocessable('Employee record not found');

  const now = new Date();
  const completed = body.progress === 100;

  const goal = await prisma.goal.create({
    data: {
      employeeId,
      title: body.title,
      description: body.description ?? null,
      type: body.type,
      status: body.status,
      weight: body.weight,
      progress: body.progress,
      startDate: body.startDate ? toUtcDate(body.startDate) : null,
      dueDate: body.dueDate ? toUtcDate(body.dueDate) : null,
      createdById: actor.id,
      ...(completed ? { status: 'COMPLETED' as const, completedAt: now } : {}),
      ...(body.kpis?.length
        ? {
            kpis: {
              create: body.kpis.map((kpi) => ({
                title: kpi.title,
                description: kpi.description ?? null,
                targetValue: kpi.targetValue,
                currentValue: 0,
                unit: kpi.unit ?? null,
                weight: kpi.weight,
              })),
            },
          }
        : {}),
    },
    select: GOAL_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.GOAL_CREATE,
    entity: 'Goal',
    entityId: goal.id,
    meta,
    newValue: {
      employeeId,
      title: goal.title,
      type: goal.type,
      status: goal.status,
      weight: goal.weight,
      progress: goal.progress,
      kpis: body.kpis?.length ?? 0,
    },
  });

  if (employeeId !== actor.employeeId) {
    await notifyEmployee(employeeId, {
      type: 'INFO',
      title: `Goal assigned: ${goal.title}`,
      message: 'A new goal has been added to your performance plan.',
      link: '/performance/goals',
      entityType: 'Goal',
      entityId: goal.id,
    });
  }

  return serializeGoal(goal);
}

export async function updateGoal(
  id: string,
  body: UpdateGoalBody,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  const existing = await prisma.goal.findUnique({
    where: { id },
    select: { id: true, employeeId: true, title: true, status: true, progress: true, startDate: true, dueDate: true, completedAt: true },
  });
  if (!existing) throw ApiError.notFound('Goal not found');
  assertEmployeeAccess(scope, existing.employeeId);

  if (body.kpis && body.kpiProgress) {
    throw ApiError.unprocessable('Send either kpis or kpiProgress, not both', [
      { field: 'kpis', message: 'KPI replacement and KPI progress cannot be combined' },
    ]);
  }

  const nextStartDate =
    body.startDate !== undefined ? body.startDate : existing.startDate ? existing.startDate.toISOString().slice(0, 10) : undefined;
  const nextDueDate =
    body.dueDate !== undefined ? body.dueDate : existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : undefined;
  assertDateOrder(nextStartDate, nextDueDate);
  assertKpiWeights(body.kpis);

  const nextProgress = body.progress ?? existing.progress;

  // Progress at 100 completes the goal; cancelling clears the completion stamp;
  // dropping progress below 100 on a completed goal reopens it.
  let status: GoalStatus = body.status ?? existing.status;
  let completedAt: Date | null = existing.completedAt;
  if (status === 'CANCELLED') {
    completedAt = null;
  } else if (nextProgress === 100) {
    status = 'COMPLETED';
    completedAt = completedAt ?? new Date();
  } else if (body.status === undefined && existing.status === 'COMPLETED' && body.progress !== undefined) {
    status = 'IN_PROGRESS';
    completedAt = null;
  } else if (status === 'COMPLETED' && completedAt === null) {
    completedAt = new Date();
  }

  const goal = await prisma.$transaction(async (tx) => {
    if (body.kpis) {
      // Replace-on-write: KPIs missing from the payload are deleted with the goal's set.
      await tx.keyPerformanceIndicator.deleteMany({ where: { goalId: id } });
      if (body.kpis.length > 0) {
        await tx.keyPerformanceIndicator.createMany({
          data: body.kpis.map((kpi) => ({
            goalId: id,
            title: kpi.title,
            description: kpi.description ?? null,
            targetValue: kpi.targetValue,
            currentValue: 0,
            unit: kpi.unit ?? null,
            weight: kpi.weight,
          })),
        });
      }
    }

    if (body.kpiProgress?.length) {
      const goalKpis = await tx.keyPerformanceIndicator.findMany({
        where: { goalId: id },
        select: { id: true, targetValue: true },
      });
      const known = new Map(goalKpis.map((kpi) => [kpi.id, kpi]));

      for (const entry of body.kpiProgress) {
        const kpi = known.get(entry.id);
        if (!kpi) {
          throw ApiError.unprocessable('KPI does not belong to this goal', [
            { field: 'kpiProgress', message: `Unknown KPI ${entry.id}` },
          ]);
        }
        await tx.keyPerformanceIndicator.update({
          where: { id: entry.id },
          data: {
            currentValue: entry.currentValue,
            achieved: entry.achieved ?? entry.currentValue >= kpi.targetValue.toNumber(),
          },
        });
      }
    }

    return tx.goal.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.weight !== undefined ? { weight: body.weight } : {}),
        ...(body.progress !== undefined ? { progress: body.progress } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? toUtcDate(body.startDate) : null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? toUtcDate(body.dueDate) : null } : {}),
        status,
        completedAt,
      },
      select: GOAL_SELECT,
    });
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.GOAL_UPDATE,
    entity: 'Goal',
    entityId: id,
    meta,
    oldValue: { status: existing.status, progress: existing.progress },
    newValue: { status: goal.status, progress: goal.progress, kpis: body.kpis?.length, kpiProgress: body.kpiProgress?.length },
  });

  return serializeGoal(goal);
}

export async function deleteGoal(id: string, actor: Actor, scope: EmployeeScope, meta: RequestMeta) {
  const existing = await prisma.goal.findUnique({
    where: { id },
    select: { id: true, employeeId: true, title: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Goal not found');
  assertEmployeeAccess(scope, existing.employeeId);

  const canManageTeam =
    hasPermission(actor.role, PERMISSIONS.GOAL_MANAGE_TEAM) || hasPermission(actor.role, PERMISSIONS.GOAL_MANAGE_ANY);

  // Owners may only remove goals that are still in flight; managers and HR may
  // remove any goal inside their scope, completed or not.
  if (!canManageTeam && existing.status === 'COMPLETED') {
    throw ApiError.forbidden('Completed goals can only be deleted by a manager');
  }

  await prisma.goal.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.GOAL_DELETE,
    entity: 'Goal',
    entityId: id,
    meta,
    oldValue: { employeeId: existing.employeeId, title: existing.title, status: existing.status },
  });

  return { id };
}

// ── Performance reviews ───────────────────────────────────────

export async function listReviews(query: ListReviewsQuery, actor: Actor) {
  const manageAny = hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY);

  const visibility: Prisma.PerformanceReviewWhereInput = manageAny
    ? {}
    : actor.employeeId
      ? { OR: [{ employeeId: actor.employeeId }, { reviewerId: actor.employeeId }] }
      // No linked employee record: the account is neither subject nor reviewer.
      : { id: { in: [] } };

  const where: Prisma.PerformanceReviewWhereInput = {
    AND: [
      visibility,
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.period ? [{ period: query.period }] : []),
      ...(query.employeeId ? [{ employeeId: query.employeeId }] : []),
      ...(query.reviewerId ? [{ reviewerId: query.reviewerId }] : []),
    ],
  };

  const [items, total] = await Promise.all([
    prisma.performanceReview.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: reviewOrderBy(query.sortBy, query.sortOrder),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.performanceReview.count({ where }),
  ]);

  return {
    items: items.map((review) => serializeReview(review)),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getReview(id: string, actor: Actor) {
  const review = await prisma.performanceReview.findUnique({ where: { id }, select: REVIEW_SELECT });
  if (!review) throw ApiError.notFound('Review not found');

  const involved =
    review.employeeId === actor.employeeId || review.reviewerId === actor.employeeId;
  if (!involved && !hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY)) {
    throw ApiError.forbidden('You can only access reviews you take part in');
  }

  return serializeReview(review);
}

/**
 * Review creation is deliberately restricted to `review:manage:team` and
 * `review:manage:any` (manager / HR roles) via the route permission: employees
 * cannot self-create reviews, they only read and acknowledge them.
 */
export async function createReview(
  body: CreateReviewBody,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  const reviewerId = body.reviewerId ?? actor.employeeId;
  if (!reviewerId) {
    throw ApiError.unprocessable('A reviewerId is required because this account is not linked to an employee');
  }

  assertPeriodOrder(body.periodStart, body.periodEnd);

  if (!hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY)) {
    assertEmployeeAccess(scope, body.employeeId);
    assertEmployeeAccess(scope, reviewerId);
  }

  const [employee, reviewer] = await Promise.all([
    prisma.employee.findUnique({ where: { id: body.employeeId }, select: { id: true } }),
    prisma.employee.findUnique({ where: { id: reviewerId }, select: { id: true } }),
  ]);
  if (!employee) throw ApiError.unprocessable('Employee record not found');
  if (!reviewer) throw ApiError.unprocessable('Reviewer record not found');

  const review = await prisma.performanceReview.create({
    data: {
      employeeId: body.employeeId,
      reviewerId,
      period: body.period,
      periodStart: toUtcDate(body.periodStart),
      periodEnd: toUtcDate(body.periodEnd),
      selfRating: body.selfRating ?? null,
      managerRating: body.managerRating ?? null,
      overallRating: computeOverallRating(body.selfRating ?? null, body.managerRating ?? null),
      status: 'DRAFT',
      achievements: body.achievements ?? null,
      strengths: body.strengths ?? null,
      improvements: body.improvements ?? null,
      managerComments: body.managerComments ?? null,
      employeeComments: body.employeeComments ?? null,
    },
    select: REVIEW_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PERFORMANCE_REVIEW_CREATE,
    entity: 'PerformanceReview',
    entityId: review.id,
    meta,
    newValue: {
      employeeId: review.employeeId,
      reviewerId: review.reviewerId,
      period: review.period,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      status: review.status,
    },
  });

  return serializeReview(review);
}

export async function updateReview(
  id: string,
  body: UpdateReviewBody,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  const existing = await prisma.performanceReview.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      reviewerId: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      selfRating: true,
      managerRating: true,
    },
  });
  if (!existing) throw ApiError.notFound('Review not found');

  if (existing.status === 'ACKNOWLEDGED') {
    throw ApiError.unprocessable('Acknowledged reviews are locked and can no longer be edited');
  }

  const nextEmployeeId = existing.employeeId;
  const nextReviewerId = body.reviewerId ?? existing.reviewerId;
  if (!hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY)) {
    assertEmployeeAccess(scope, nextEmployeeId);
    assertEmployeeAccess(scope, nextReviewerId);
  }

  const periodStart = body.periodStart ?? existing.periodStart.toISOString().slice(0, 10);
  const periodEnd = body.periodEnd ?? existing.periodEnd.toISOString().slice(0, 10);
  assertPeriodOrder(periodStart, periodEnd);

  const selfRating = body.selfRating !== undefined ? body.selfRating : toNumber(existing.selfRating);
  const managerRating = body.managerRating !== undefined ? body.managerRating : toNumber(existing.managerRating);

  const review = await prisma.performanceReview.update({
    where: { id },
    data: {
      ...(body.reviewerId !== undefined ? { reviewerId: body.reviewerId } : {}),
      ...(body.period !== undefined ? { period: body.period } : {}),
      ...(body.periodStart !== undefined ? { periodStart: toUtcDate(body.periodStart) } : {}),
      ...(body.periodEnd !== undefined ? { periodEnd: toUtcDate(body.periodEnd) } : {}),
      ...(body.selfRating !== undefined ? { selfRating: body.selfRating } : {}),
      ...(body.managerRating !== undefined ? { managerRating: body.managerRating } : {}),
      ...(body.achievements !== undefined ? { achievements: body.achievements ?? null } : {}),
      ...(body.strengths !== undefined ? { strengths: body.strengths ?? null } : {}),
      ...(body.improvements !== undefined ? { improvements: body.improvements ?? null } : {}),
      ...(body.managerComments !== undefined ? { managerComments: body.managerComments ?? null } : {}),
      ...(body.employeeComments !== undefined ? { employeeComments: body.employeeComments ?? null } : {}),
      overallRating: computeOverallRating(selfRating, managerRating),
    },
    select: REVIEW_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PERFORMANCE_REVIEW_UPDATE,
    entity: 'PerformanceReview',
    entityId: id,
    meta,
    oldValue: { status: existing.status, selfRating: toNumber(existing.selfRating), managerRating: toNumber(existing.managerRating) },
    newValue: { selfRating: toNumber(review.selfRating), managerRating: toNumber(review.managerRating) },
  });

  return serializeReview(review);
}

export async function submitReview(id: string, body: SubmitReviewBody, actor: Actor, scope: EmployeeScope, meta: RequestMeta) {
  const existing = await prisma.performanceReview.findUnique({
    where: { id },
    select: { id: true, employeeId: true, reviewerId: true, status: true, selfRating: true, managerRating: true, period: true },
  });
  if (!existing) throw ApiError.notFound('Review not found');
  if (existing.status !== 'DRAFT') {
    throw ApiError.conflict('Only reviews in draft can be submitted');
  }

  if (!hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY)) {
    assertEmployeeAccess(scope, existing.employeeId);
    assertEmployeeAccess(scope, existing.reviewerId);
  }

  const managerRating = body.managerRating !== undefined ? body.managerRating : toNumber(existing.managerRating);
  if (managerRating === null) {
    throw ApiError.unprocessable('A manager rating is required before a review can be submitted', [
      { field: 'managerRating', message: 'Manager rating is required' },
    ]);
  }

  const selfRating = toNumber(existing.selfRating);
  const overallRating = computeOverallRating(selfRating, managerRating);
  if (overallRating === null) {
    throw ApiError.unprocessable('A review needs at least one rating before it can be submitted');
  }

  const review = await prisma.performanceReview.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      managerRating,
      ...(body.managerComments !== undefined ? { managerComments: body.managerComments ?? null } : {}),
      overallRating,
      submittedAt: new Date(),
    },
    select: REVIEW_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PERFORMANCE_REVIEW_SUBMIT,
    entity: 'PerformanceReview',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: review.status, overallRating: toNumber(review.overallRating) },
  });

  await notifyEmployee(existing.employeeId, {
    type: 'INFO',
    title: 'Your performance review is ready',
    message: 'Your manager submitted the review. Open it to read and acknowledge.',
    link: '/performance/reviews',
    entityType: 'PerformanceReview',
    entityId: id,
  });

  return serializeReview(review);
}

export async function acknowledgeReview(
  id: string,
  body: AcknowledgeReviewBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.performanceReview.findUnique({
    where: { id },
    select: { id: true, employeeId: true, reviewerId: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Review not found');

  const isSubject = existing.employeeId === actor.employeeId;
  if (!isSubject && !hasPermission(actor.role, PERMISSIONS.REVIEW_MANAGE_ANY)) {
    throw ApiError.forbidden('Only the employee being reviewed can acknowledge this review');
  }

  if (existing.status !== 'SUBMITTED') {
    throw ApiError.conflict('Only submitted reviews can be acknowledged');
  }

  const review = await prisma.performanceReview.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      ...(body.employeeComments !== undefined ? { employeeComments: body.employeeComments ?? null } : {}),
    },
    select: REVIEW_SELECT,
  });

  // The fixed AuditAction enum has no ACKNOWLEDGE member, so the transition is
  // recorded as an update with the status change in the payload.
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PERFORMANCE_REVIEW_UPDATE,
    entity: 'PerformanceReview',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: review.status, acknowledgedBy: actor.employeeId ?? actor.id },
  });

  await notifyEmployee(existing.reviewerId, {
    type: 'SUCCESS',
    title: 'Performance review acknowledged',
    message: 'The employee you reviewed has acknowledged their review.',
    link: '/performance/reviews',
    entityType: 'PerformanceReview',
    entityId: id,
  });

  return serializeReview(review);
}
