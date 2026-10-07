import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { startOfUtcDay, toUtcDate } from '../../utils/workdays';
import type { ListAuditLogsQuery } from './audit.validator';

export const AUDIT_ENTITIES = [
  'User',
  'Employee',
  'Department',
  'Designation',
  'Attendance',
  'LeaveRequest',
  'LeaveType',
  'LeaveBalance',
  'Holiday',
  'EmployeeDocument',
  'SalaryStructure',
  'PayrollRun',
  'Payslip',
  'JobOpening',
  'Candidate',
  'Interview',
  'Offer',
  'Goal',
  'PerformanceReview',
  'Announcement',
] as const;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function dateRange(query: ListAuditLogsQuery): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;

  return {
    ...(query.from ? { gte: startOfUtcDay(toUtcDate(query.from)) } : {}),
    ...(query.to ? { lt: new Date(startOfUtcDay(toUtcDate(query.to)).getTime() + ONE_DAY_MS) } : {}),
  };
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const createdAt = dateRange(query);
  const baseWhere: Prisma.AuditLogWhereInput = {
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.userEmail ? { userEmail: { contains: query.userEmail, mode: 'insensitive' as const } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const where: Prisma.AuditLogWhereInput = {
    ...baseWhere,
    ...(query.action ? { action: query.action as AuditAction } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
  };

  const select = {
    id: true,
    userId: true,
    userEmail: true,
    action: true,
    entity: true,
    entityId: true,
    oldValue: true,
    newValue: true,
    ipAddress: true,
    userAgent: true,
    requestId: true,
    createdAt: true,
  } as const;

  // Each facet applies every filter except its own dimension, so selecting an action
  // still shows which entities are available and vice versa.
  const [items, total, actionGroups, entityGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select,
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { ...baseWhere, ...(query.entity ? { entity: query.entity } : {}) },
      _count: { _all: true },
      orderBy: { action: 'asc' },
      take: 60,
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: { ...baseWhere, ...(query.action ? { action: query.action as AuditAction } : {}) },
      _count: { _all: true },
      orderBy: { entity: 'asc' },
    }),
  ]);

  return {
    items,
    meta: buildPaginationMeta(query.page, query.limit, total),
    facets: {
      actions: actionGroups.map((group) => ({ value: group.action, count: group._count._all })),
      entities: entityGroups.map((group) => ({ value: group.entity, count: group._count._all })),
    },
  };
}

export async function getAuditLog(id: string) {
  const entry = await prisma.auditLog.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      userEmail: true,
      action: true,
      entity: true,
      entityId: true,
      oldValue: true,
      newValue: true,
      ipAddress: true,
      userAgent: true,
      requestId: true,
      createdAt: true,
    },
  });

  return entry;
}