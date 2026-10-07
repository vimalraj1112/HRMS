import { ApprovalStage, AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { notifyEmployee } from '../notifications/notifications.service';
import {
  countWorkingDays,
  differenceInDays,
  eachUtcDay,
  isWeekend,
  toDateInputValue,
  toUtcDate,
  todayUtc,
} from '../../utils/workdays';
import type {
  AdjustBalanceBody,
  ApplyLeaveBody,
  CancelLeaveBody,
  CreateLeaveTypeBody,
  DecideLeaveBody,
  ListLeaveRequestsQuery,
  ListLeaveTypesQuery,
  UpdateLeaveTypeBody,
} from './leave.validator';

export interface Actor {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value === null || value === undefined ? 0 : value.toNumber();

const EMPLOYEE_BRIEF = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, name: true } },
} as const;

const LEAVE_TYPE_BRIEF = {
  id: true,
  name: true,
  code: true,
  color: true,
  unit: true,
  annualQuota: true,
  minDaysNotice: true,
  isPaid: true,
} as const;

const LEAVE_REQUEST_SELECT = {
  id: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  totalDays: true,
  reason: true,
  contactDuringLeave: true,
  documentKey: true,
  status: true,
  appliedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  managerId: true,
  managerStage: true,
  managerRemark: true,
  managerActionAt: true,
  hrApproverId: true,
  hrStage: true,
  hrRemark: true,
  hrActionAt: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: EMPLOYEE_BRIEF },
  leaveType: { select: LEAVE_TYPE_BRIEF },
  manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
} as const;

function withNumericDays<T extends { totalDays: Prisma.Decimal }>(request: T) {
  const { totalDays, ...rest } = request;
  return { ...rest, totalDays: toNumber(totalDays) };
}

async function holidaySetBetween(start: Date, end: Date): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { isActive: true, date: { gte: start, lte: end } },
    select: { date: true },
  });

  return new Set(holidays.map((holiday) => toDateInputValue(holiday.date)));
}

async function ensureBalance(employeeId: string, leaveTypeId: string, year: number, quota: Prisma.Decimal) {
  return prisma.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    create: { employeeId, leaveTypeId, year, allocated: quota },
    update: {},
  });
}

function availableDays(balance: {
  allocated: Prisma.Decimal;
  used: Prisma.Decimal;
  pending: Prisma.Decimal;
  carriedForward: Prisma.Decimal;
}): number {
  return (
    toNumber(balance.allocated) + toNumber(balance.carriedForward) - toNumber(balance.used) - toNumber(balance.pending)
  );
}

export async function listBalances(query: { year?: string }, employeeId: string) {
  const year = query.year ? Number(query.year) : todayUtc().getUTCFullYear();
  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId, year },
    select: {
      id: true,
      year: true,
      allocated: true,
      used: true,
      pending: true,
      carriedForward: true,
      leaveType: { select: { id: true, name: true, code: true, color: true, unit: true, isActive: true, annualQuota: true } },
    },
    orderBy: { leaveType: { name: 'asc' } },
  });

  return balances.map((balance) => ({
    id: balance.id,
    year: balance.year,
    leaveType: {
      id: balance.leaveType.id,
      name: balance.leaveType.name,
      code: balance.leaveType.code,
      color: balance.leaveType.color,
      unit: balance.leaveType.unit,
      isActive: balance.leaveType.isActive,
    },
    allocated: toNumber(balance.allocated),
    used: toNumber(balance.used),
    pending: toNumber(balance.pending),
    carriedForward: toNumber(balance.carriedForward),
    annualQuota: toNumber(balance.leaveType.annualQuota),
    available:
      toNumber(balance.allocated) + toNumber(balance.carriedForward) - toNumber(balance.used) - toNumber(balance.pending),
  }));
}

export async function listEmployeeBalances(employeeId: string, query: { year?: string }) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, firstName: true, lastName: true } });
  if (!employee) throw ApiError.notFound('Employee record not found');

  const items = await listBalances(query, employeeId);

  return {
    employee,
    year: items[0]?.year ?? (query.year ? Number(query.year) : todayUtc().getUTCFullYear()),
    items,
  };
}

/**
 * Carry forward is capped by the leave type and only granted when the type allows it.
 * Expired entitlements are intentionally dropped so they do not accumulate year after year.
 */
export function carryForwardAmount(balance: {
  allocated: Prisma.Decimal;
  used: Prisma.Decimal;
  pending: Prisma.Decimal;
  carriedForward: Prisma.Decimal;
}, leaveType: { allowsCarryForward: boolean; maxCarryForward: Prisma.Decimal }): number {
  if (!leaveType.allowsCarryForward) return 0;
  const remaining = Math.max(0, availableDays(balance));
  return Math.min(remaining, toNumber(leaveType.maxCarryForward));
}

/**
 * Creates or refreshes a single year balance, keeping the higher of any existing
 * allocation and the leave type quota so a rollover never wipes an HR grant.
 */
async function upsertYearBalance(input: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  quota: Prisma.Decimal;
  carriedForward: number;
}): Promise<'created' | 'kept'> {
  const existing = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year: input.year,
      },
    },
    select: { allocated: true, used: true, carriedForward: true },
  });

  if (existing) {
    const allocated = Math.max(toNumber(existing.allocated), toNumber(input.quota));
    await prisma.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          year: input.year,
        },
      },
      data: {
        allocated,
        ...(toNumber(existing.carriedForward) < input.carriedForward
          ? { carriedForward: input.carriedForward }
          : {}),
      },
    });
    return 'kept';
  }

  await prisma.leaveBalance.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      allocated: input.quota,
      carriedForward: input.carriedForward,
    },
  });
  return 'created';
}

export async function adjustBalance(id: string, body: AdjustBalanceBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { id },
    select: {
      id: true,
      year: true,
      allocated: true,
      used: true,
      pending: true,
      carriedForward: true,
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      leaveType: { select: { id: true, name: true, code: true, unit: true } },
    },
  });
  if (!existing) throw ApiError.notFound('Leave balance not found');

  const allocated = body.allocated ?? toNumber(existing.allocated);
  const carriedForward = body.carriedForward ?? toNumber(existing.carriedForward);
  const consumed = toNumber(existing.used) + toNumber(existing.pending);

  if (allocated + carriedForward < consumed) {
    throw ApiError.unprocessable(
      `Allocation cannot be lower than the ${consumed} already used or pending for this balance`,
    );
  }

  const updated = await prisma.leaveBalance.update({
    where: { id },
    data: { allocated, carriedForward },
    select: {
      id: true,
      year: true,
      allocated: true,
      used: true,
      pending: true,
      carriedForward: true,
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      leaveType: { select: { id: true, name: true, code: true, unit: true } },
    },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_BALANCE_UPDATE,
    entity: 'LeaveBalance',
    entityId: id,
    meta,
    oldValue: {
      allocated: toNumber(existing.allocated),
      carriedForward: toNumber(existing.carriedForward),
    },
    newValue: {
      allocated,
      carriedForward,
      ...(body.note ? { note: body.note } : {}),
    },
  });

  return serializeBalance(updated);
}

function serializeBalance(balance: {
  allocated: Prisma.Decimal;
  used: Prisma.Decimal;
  pending: Prisma.Decimal;
  carriedForward: Prisma.Decimal;
}) {
  return {
    ...balance,
    allocated: toNumber(balance.allocated),
    used: toNumber(balance.used),
    pending: toNumber(balance.pending),
    carriedForward: toNumber(balance.carriedForward),
    available: availableDays(balance),
  };
}

/**
 * Rolls a year of leave balances into the next year. Safe to re-run: existing
 * balances keep the higher allocation and any carry forward already granted.
 */
export async function rolloverBalances(fromYear: number, toYear: number) {
  if (toYear !== fromYear + 1) {
    throw ApiError.unprocessable('Can only roll balances forward one year at a time');
  }

  const [sourceBalances, leaveTypes, employees] = await Promise.all([
    prisma.leaveBalance.findMany({
      where: { year: fromYear },
      select: {
        employeeId: true,
        allocated: true,
        used: true,
        pending: true,
        carriedForward: true,
        leaveType: { select: { id: true, name: true, annualQuota: true, allowsCarryForward: true, maxCarryForward: true } },
      },
    }),
    prisma.leaveType.findMany({ where: { isActive: true }, select: { id: true, name: true, annualQuota: true, allowsCarryForward: true, maxCarryForward: true } }),
    prisma.employee.findMany({ where: { status: { not: 'TERMINATED' } }, select: { id: true } }),
  ]);

  const carried: Array<{ employeeId: string; leaveTypeId: string; leaveTypeName: string; amount: number }> = [];
  let created = 0;
  let kept = 0;

  for (const employee of employees) {
    for (const leaveType of leaveTypes) {
      const source = sourceBalances.find(
        (item) => item.employeeId === employee.id && item.leaveType.id === leaveType.id,
      );

      const carriedForward = source ? carryForwardAmount(source, leaveType) : 0;
      if (carriedForward > 0) {
        carried.push({ employeeId: employee.id, leaveTypeId: leaveType.id, leaveTypeName: leaveType.name, amount: carriedForward });
      }

      const result = await upsertYearBalance({
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        year: toYear,
        quota: leaveType.annualQuota,
        carriedForward,
      });
      if (result === 'created') created += 1;
      else kept += 1;
    }
  }

  return { fromYear, toYear, employees: employees.length, leaveTypes: leaveTypes.length, created, kept, carried };
}

function rangeFilter(from?: string, to?: string): Prisma.LeaveRequestWhereInput {
  if (!from && !to) return {};
  return {
    AND: [
      { startDate: { ...(to ? { lte: toUtcDate(to) } : {}) } },
      { endDate: { ...(from ? { gte: toUtcDate(from) } : {}) } },
    ],
  };
}

export async function listMyRequests(query: ListLeaveRequestsQuery, employeeId: string | null) {
  if (!employeeId) {
    return { items: [], meta: buildPaginationMeta(query.page, query.limit, 0) };
  }

  const where: Prisma.LeaveRequestWhereInput = {
    employeeId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
    ...(query.search
      ? { reason: { contains: query.search, mode: 'insensitive' as const } }
      : {}),
    ...rangeFilter(query.from, query.to),
  };

  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      select: LEAVE_REQUEST_SELECT,
      orderBy: [{ startDate: query.sortOrder }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return {
    items: items.map(withNumericDays),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function listRequests(query: ListLeaveRequestsQuery, scope: EmployeeScope) {
  const where: Prisma.LeaveRequestWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
    ...rangeFilter(query.from, query.to),
  };

  if (scope.mode === 'all') {
    if (query.employeeId) where.employeeId = query.employeeId;
  } else {
    const allowed = query.employeeId
      ? scope.employeeIds?.includes(query.employeeId)
        ? [query.employeeId]
        : []
      : (scope.employeeIds ?? []);
    where.employeeId = { in: allowed };
  }

  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      select: LEAVE_REQUEST_SELECT,
      orderBy: [{ appliedAt: query.sortOrder }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { items: items.map(withNumericDays), meta: buildPaginationMeta(query.page, query.limit, total) };
}

/** Requests waiting on the caller's own approval stage. */
export async function listApprovals(query: ListLeaveRequestsQuery, actor: Actor) {
  const conditions: Prisma.LeaveRequestWhereInput[] = [];
  const hrRights = hasPermission(actor.role, PERMISSIONS.LEAVE_APPROVE_HR) || hasPermission(actor.role, PERMISSIONS.LEAVE_MANAGE);

  if (actor.employeeId) conditions.push({ managerId: actor.employeeId, managerStage: ApprovalStage.PENDING });
  if (hrRights) conditions.push({ hrStage: ApprovalStage.PENDING });

  if (conditions.length === 0) {
    throw ApiError.forbidden('You are not allowed to approve leave requests');
  }

  const where: Prisma.LeaveRequestWhereInput = {
    status: 'PENDING',
    OR: conditions,
    ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
    ...rangeFilter(query.from, query.to),
  };

  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      select: LEAVE_REQUEST_SELECT,
      orderBy: [{ startDate: 'asc' }, { appliedAt: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { items: items.map(withNumericDays), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getRequest(id: string, scope: EmployeeScope) {
  const request = await prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_REQUEST_SELECT });
  if (!request) throw ApiError.notFound('Leave request not found');

  if (scope.mode !== 'all' && !scope.employeeIds?.includes(request.employeeId)) {
    throw ApiError.forbidden('You are not allowed to access this leave request');
  }

  return withNumericDays(request);
}

export async function applyLeave(body: ApplyLeaveBody, actor: Actor, meta: RequestMeta) {
  if (!actor.employeeId) {
    throw ApiError.unprocessable('Your user account is not linked to an employee record');
  }

  const employee = await prisma.employee.findUnique({
    where: { id: actor.employeeId },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, managerId: true, status: true },
  });

  if (!employee) throw ApiError.notFound('Employee record not found');
  if (employee.status !== 'ACTIVE') {
    throw ApiError.unprocessable('Leave can only be applied by an active employee');
  }

  const leaveType = await prisma.leaveType.findUnique({ where: { id: body.leaveTypeId } });
  if (!leaveType) throw ApiError.notFound('Leave type not found');
  if (!leaveType.isActive) throw ApiError.unprocessable('This leave type is no longer available');

  const startDate = toUtcDate(body.startDate);
  const endDate = toUtcDate(body.endDate);
  const today = todayUtc();

  if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
    throw ApiError.unprocessable('A leave request must start and end within the same calendar year');
  }
  if (startDate < today) throw ApiError.unprocessable('Leave cannot be backdated');

  const noticeDays = differenceInDays(startDate, today);
  if (noticeDays < leaveType.minDaysNotice) {
    throw ApiError.unprocessable(
      `${leaveType.name} requires at least ${leaveType.minDaysNotice} day(s) of advance notice`,
    );
  }

  const totalDays = countWorkingDays(startDate, endDate, await holidaySetBetween(startDate, endDate));
  if (totalDays <= 0) {
    throw ApiError.unprocessable('The selected range does not contain any working days');
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, status: true, startDate: true, endDate: true },
  });

  if (overlap) {
    throw ApiError.conflict(
      `These dates overlap with an existing ${overlap.status.toLowerCase()} request from ${toDateInputValue(overlap.startDate)} to ${toDateInputValue(overlap.endDate)}`,
    );
  }

  const year = startDate.getUTCFullYear();
  const balance = await ensureBalance(employee.id, leaveType.id, year, leaveType.annualQuota);
  const quota = toNumber(leaveType.annualQuota);

  if (quota > 0) {
    const available = availableDays(balance);
    if (totalDays > available) {
      throw ApiError.unprocessable(
        `Insufficient ${leaveType.name} balance: ${available} day(s) available but ${totalDays} requested`,
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        totalDays: new Prisma.Decimal(totalDays),
        reason: body.reason,
        contactDuringLeave: body.contactDuringLeave ?? null,
        managerId: employee.managerId,
        managerStage: employee.managerId ? ApprovalStage.PENDING : ApprovalStage.SKIPPED,
      },
      select: LEAVE_REQUEST_SELECT,
    });

    await tx.leaveBalance.update({ where: { id: balance.id }, data: { pending: { increment: totalDays } } });

    return request;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_APPLY,
    entity: 'LeaveRequest',
    entityId: created.id,
    meta,
    newValue: {
      leaveType: leaveType.code,
      startDate,
      endDate,
      totalDays,
      managerStage: created.managerStage,
    },
  });

  if (employee.managerId) {
    await notifyEmployee(employee.managerId, {
      type: 'INFO',
      title: `Leave request from ${employee.firstName} ${employee.lastName}`,
      message: `${leaveType.name} from ${toDateInputValue(startDate)} to ${toDateInputValue(endDate)} (${totalDays} day(s)) is waiting for your approval.`,
      link: '/leaves/requests',
      entityType: 'LeaveRequest',
      entityId: created.id,
    });
  }

  return withNumericDays(created);
}

export async function decideRequest(id: string, body: DecideLeaveBody, actor: Actor, meta: RequestMeta) {
  const request = await prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_REQUEST_SELECT });
  if (!request) throw ApiError.notFound('Leave request not found');
  if (request.status !== 'PENDING') {
    throw ApiError.conflict('This leave request has already been decided');
  }
  if (request.employeeId === actor.employeeId) {
    throw ApiError.forbidden('You cannot decide your own leave request');
  }

  const hrRights =
    hasPermission(actor.role, PERMISSIONS.LEAVE_APPROVE_HR) || hasPermission(actor.role, PERMISSIONS.LEAVE_MANAGE);
  const isAssignedManager = actor.employeeId !== null && request.managerId === actor.employeeId;

  let stage: 'manager' | 'hr';
  if (request.managerStage === ApprovalStage.PENDING) {
    stage = 'manager';
    if (!isAssignedManager && !hrRights) {
      throw ApiError.forbidden('Only the assigned manager or HR can complete the manager approval');
    }
  } else if (request.hrStage === ApprovalStage.PENDING) {
    stage = 'hr';
    if (!hrRights) {
      throw ApiError.forbidden('Only HR can complete the final approval');
    }
  } else {
    throw ApiError.conflict('Every approval stage for this request has already been completed');
  }

  const approved = body.decision === 'APPROVE';
  const totalDays = toNumber(request.totalDays);
  const year = request.startDate.getUTCFullYear();

  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
      },
    },
    select: { id: true, allocated: true, used: true, pending: true, carriedForward: true },
  });

  if (!balance) throw ApiError.unprocessable('The leave balance for this request is missing');

  const holidays = await holidaySetBetween(request.startDate, request.endDate);
  const leaveDays = eachUtcDay(request.startDate, request.endDate).filter(
    (day) => !isWeekend(day) && !holidays.has(toDateInputValue(day)),
  );

  const stageUpdate: Prisma.LeaveRequestUncheckedUpdateInput =
    stage === 'manager'
      ? {
          managerStage: approved ? ApprovalStage.APPROVED : ApprovalStage.REJECTED,
          managerRemark: body.remark ?? null,
          managerActionAt: new Date(),
          managerActionById: actor.employeeId,
        }
      : {
          hrStage: approved ? ApprovalStage.APPROVED : ApprovalStage.REJECTED,
          hrRemark: body.remark ?? null,
          hrActionAt: new Date(),
          hrApproverId: actor.id,
        };

  const nextManagerStage = approved
    ? stage === 'manager'
      ? ApprovalStage.APPROVED
      : request.managerStage
    : request.managerStage;
  const nextHrStage = approved
    ? stage === 'hr'
      ? ApprovalStage.APPROVED
      : request.hrStage
    : request.hrStage;
  const fullyApproved =
    approved && nextManagerStage !== ApprovalStage.PENDING && nextHrStage !== ApprovalStage.PENDING;

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.leaveRequest.update({
      where: { id },
      data: {
        ...stageUpdate,
        ...(approved ? {} : { status: 'REJECTED' }),
        ...(fullyApproved ? { status: 'APPROVED' } : {}),
      },
      select: LEAVE_REQUEST_SELECT,
    });

    if (fullyApproved) {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pending: { decrement: totalDays },
          used: { increment: totalDays },
        },
      });

      await tx.attendance.createMany({
        data: leaveDays.map((day) => ({
          employeeId: request.employeeId,
          date: day,
          status: 'ON_LEAVE' as const,
          source: 'SYSTEM' as const,
          notes: `Approved ${request.leaveType.name} leave`,
        })),
        skipDuplicates: true,
      });
    } else if (!approved) {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: Math.max(0, toNumber(balance.pending) - totalDays) },
      });
    }

    return record;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: approved ? AuditAction.LEAVE_APPROVE : AuditAction.LEAVE_REJECT,
    entity: 'LeaveRequest',
    entityId: id,
    meta,
    oldValue: { status: request.status, managerStage: request.managerStage, hrStage: request.hrStage },
    newValue: { status: updated.status, stage, decision: body.decision, remark: body.remark ?? null },
  });

  await notifyEmployee(request.employeeId, {
    type: fullyApproved ? 'SUCCESS' : approved ? 'INFO' : 'WARNING',
    title: fullyApproved
      ? `${request.leaveType.name} leave approved`
      : approved
        ? `${request.leaveType.name} leave moved to HR approval`
        : `${request.leaveType.name} leave rejected`,
    message: `${toDateInputValue(request.startDate)} to ${toDateInputValue(request.endDate)} (${totalDays} day(s)).${
      body.remark ? ` Remark: ${body.remark}` : ''
    }`,
    link: '/leaves/my',
    entityType: 'LeaveRequest',
    entityId: id,
  });

  return withNumericDays(updated);
}

export async function cancelRequest(id: string, body: CancelLeaveBody, actor: Actor, meta: RequestMeta) {
  const request = await prisma.leaveRequest.findUnique({ where: { id }, select: LEAVE_REQUEST_SELECT });
  if (!request) throw ApiError.notFound('Leave request not found');

  const isOwner = request.employeeId === actor.employeeId;
  if (!isOwner && !hasPermission(actor.role, PERMISSIONS.LEAVE_MANAGE)) {
    throw ApiError.forbidden('You can only cancel your own leave requests');
  }

  if (request.status !== 'PENDING' && request.status !== 'APPROVED') {
    throw ApiError.conflict('Only a pending or approved request can be cancelled');
  }
  if (request.startDate <= todayUtc()) {
    throw ApiError.unprocessable('Leave that has already started cannot be cancelled');
  }

  const totalDays = toNumber(request.totalDays);
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year: request.startDate.getUTCFullYear(),
      },
    },
    select: { id: true, allocated: true, used: true, pending: true, carriedForward: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: body.reason,
      },
      select: LEAVE_REQUEST_SELECT,
    });

    if (balance) {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data:
          request.status === 'APPROVED'
            ? { used: Math.max(0, toNumber(balance.used) - totalDays) }
            : { pending: Math.max(0, toNumber(balance.pending) - totalDays) },
      });
    }

    await tx.attendance.deleteMany({
      where: {
        employeeId: request.employeeId,
        date: { gte: request.startDate, lte: request.endDate },
        status: 'ON_LEAVE',
        source: 'SYSTEM',
        isCorrected: false,
      },
    });

    return record;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_CANCEL,
    entity: 'LeaveRequest',
    entityId: id,
    meta,
    oldValue: { status: request.status },
    newValue: { status: updated.status, reason: body.reason },
  });

  if (!isOwner) {
    await notifyEmployee(request.employeeId, {
      type: 'WARNING',
      title: `${request.leaveType.name} leave cancelled by HR`,
      message: `${toDateInputValue(request.startDate)} to ${toDateInputValue(request.endDate)} was cancelled. Reason: ${body.reason}`,
      link: '/leaves/my',
      entityType: 'LeaveRequest',
      entityId: id,
    });
  }

  return withNumericDays(updated);
}

const LEAVE_TYPE_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  unit: true,
  annualQuota: true,
  isPaid: true,
  allowsCarryForward: true,
  maxCarryForward: true,
  requiresDocument: true,
  minDaysNotice: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeLeaveType<T extends { annualQuota: Prisma.Decimal; maxCarryForward: Prisma.Decimal }>(type: T) {
  return { ...type, annualQuota: toNumber(type.annualQuota), maxCarryForward: toNumber(type.maxCarryForward) };
}

export async function listLeaveTypes(query: ListLeaveTypesQuery) {
  const where: Prisma.LeaveTypeWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.leaveType.findMany({
      where,
      select: LEAVE_TYPE_SELECT,
      orderBy: { name: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leaveType.count({ where }),
  ]);

  return { items: items.map(serializeLeaveType), meta: buildPaginationMeta(query.page, query.limit, total) };
}

async function assertLeaveTypeUnique(name: string, code: string, ignoreId?: string): Promise<void> {
  const clash = await prisma.leaveType.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: { equals: code, mode: 'insensitive' } }],
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { name: true, code: true },
  });

  if (!clash) return;
  if (clash.name.toLowerCase() === name.toLowerCase()) {
    throw ApiError.conflict('A leave type with this name already exists');
  }
  throw ApiError.conflict('A leave type with this code already exists');
}

export async function createLeaveType(body: CreateLeaveTypeBody, actor: Actor, meta: RequestMeta) {
  await assertLeaveTypeUnique(body.name, body.code);

  const created = await prisma.leaveType.create({
    data: {
      name: body.name,
      code: body.code,
      description: body.description ?? null,
      unit: body.unit,
      annualQuota: body.annualQuota,
      isPaid: body.isPaid,
      allowsCarryForward: body.allowsCarryForward,
      maxCarryForward: body.maxCarryForward,
      requiresDocument: body.requiresDocument,
      minDaysNotice: body.minDaysNotice,
      color: body.color ?? null,
      isActive: body.isActive,
    },
    select: LEAVE_TYPE_SELECT,
  });

  const year = todayUtc().getUTCFullYear();
  const employees = await prisma.employee.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: { id: true },
  });

  if (employees.length > 0) {
    await prisma.leaveBalance.createMany({
      data: employees.map((employee) => ({
        employeeId: employee.id,
        leaveTypeId: created.id,
        year,
        allocated: created.annualQuota,
      })),
      skipDuplicates: true,
    });
  }

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_TYPE_CREATE,
    entity: 'LeaveType',
    entityId: created.id,
    meta,
    newValue: { name: created.name, code: created.code, annualQuota: body.annualQuota },
  });

  return serializeLeaveType(created);
}

export async function updateLeaveType(id: string, body: UpdateLeaveTypeBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.leaveType.findUnique({ where: { id }, select: LEAVE_TYPE_SELECT });
  if (!existing) throw ApiError.notFound('Leave type not found');

  const name = body.name ?? existing.name;
  const code = body.code ?? existing.code;
  await assertLeaveTypeUnique(name, code, id);

  if (
    body.allowsCarryForward !== undefined &&
    !body.allowsCarryForward &&
    (body.maxCarryForward ?? toNumber(existing.maxCarryForward)) > 0
  ) {
    throw ApiError.unprocessable('Remove the carry forward limit before disabling carry forward');
  }

  const updated = await prisma.leaveType.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.unit !== undefined ? { unit: body.unit } : {}),
      ...(body.annualQuota !== undefined ? { annualQuota: body.annualQuota } : {}),
      ...(body.isPaid !== undefined ? { isPaid: body.isPaid } : {}),
      ...(body.allowsCarryForward !== undefined ? { allowsCarryForward: body.allowsCarryForward } : {}),
      ...(body.maxCarryForward !== undefined ? { maxCarryForward: body.maxCarryForward } : {}),
      ...(body.requiresDocument !== undefined ? { requiresDocument: body.requiresDocument } : {}),
      ...(body.minDaysNotice !== undefined ? { minDaysNotice: body.minDaysNotice } : {}),
      ...(body.color !== undefined ? { color: body.color || null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    select: LEAVE_TYPE_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_TYPE_UPDATE,
    entity: 'LeaveType',
    entityId: id,
    meta,
    oldValue: { name: existing.name, code: existing.code, isActive: existing.isActive, annualQuota: toNumber(existing.annualQuota) },
    newValue: { name: updated.name, code: updated.code, isActive: updated.isActive, annualQuota: toNumber(updated.annualQuota) },
  });

  return serializeLeaveType(updated);
}

export async function deleteLeaveType(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.leaveType.findUnique({
    where: { id },
    select: { id: true, name: true, code: true },
  });
  if (!existing) throw ApiError.notFound('Leave type not found');

  const [requests, balances] = await Promise.all([
    prisma.leaveRequest.count({ where: { leaveTypeId: id } }),
    prisma.leaveBalance.count({ where: { leaveTypeId: id, OR: [{ used: { gt: 0 } }, { pending: { gt: 0 } }] } }),
  ]);

  if (requests > 0) {
    throw ApiError.conflict('This leave type is used by leave requests and can only be deactivated');
  }
  if (balances > 0) {
    throw ApiError.conflict('This leave type still has leave in use and can only be deactivated');
  }

  await prisma.leaveType.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.LEAVE_TYPE_DELETE,
    entity: 'LeaveType',
    entityId: id,
    meta,
    oldValue: { name: existing.name, code: existing.code },
  });

  return { id, name: existing.name, code: existing.code };
}
