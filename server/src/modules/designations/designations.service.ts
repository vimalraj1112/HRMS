import { AuditAction, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { CreateDesignationBody, ListDesignationsQuery, UpdateDesignationBody } from './designations.validator';

const DESIGNATION_SELECT = {
  id: true,
  name: true,
  code: true,
  level: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { employees: true } },
} as const;

const SORTABLE_FIELDS = new Set(['name', 'code', 'level', 'createdAt']);

interface Actor {
  id: string;
  email: string;
}

export async function listDesignations(query: ListDesignationsQuery) {
  const { page, limit, search, sortBy, sortOrder, includeInactive } = query;

  const where: Prisma.DesignationWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.DesignationOrderByWithRelationInput = SORTABLE_FIELDS.has(sortBy ?? '')
    ? { [sortBy as string]: sortOrder }
    : { name: 'asc' };

  const [items, total] = await Promise.all([
    prisma.designation.findMany({ where, select: DESIGNATION_SELECT, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.designation.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getDesignationById(id: string) {
  const designation = await prisma.designation.findUnique({ where: { id }, select: DESIGNATION_SELECT });
  if (!designation) throw ApiError.notFound('Designation not found');
  return designation;
}

export async function createDesignation(payload: CreateDesignationBody, actor: Actor, meta: RequestMeta) {
  const clash = await prisma.designation.findFirst({
    where: { OR: [{ name: payload.name }, { code: payload.code }] },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('A designation with this name or code already exists');

  const designation = await prisma.designation.create({
    data: {
      name: payload.name,
      code: payload.code,
      level: payload.level ?? null,
      description: payload.description ?? null,
      isActive: payload.isActive,
    },
    select: DESIGNATION_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DESIGNATION_CREATE,
    entity: 'Designation',
    entityId: designation.id,
    meta,
    newValue: { name: designation.name, code: designation.code },
  });

  return designation;
}

export async function updateDesignation(
  id: string,
  payload: UpdateDesignationBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.designation.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!existing) throw ApiError.notFound('Designation not found');

  if (payload.name || payload.code) {
    const clash = await prisma.designation.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(payload.name ? [{ name: payload.name }] : []),
          ...(payload.code ? [{ code: payload.code }] : []),
        ],
      },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict('A designation with this name or code already exists');
  }

  if (payload.isActive === false) {
    const assigned = await prisma.employee.count({ where: { designationId: id, status: 'ACTIVE' } });
    if (assigned > 0) {
      throw ApiError.unprocessable(
        `Reassign the ${assigned} active employee(s) before deactivating this designation`,
      );
    }
  }

  const designation = await prisma.designation.update({
    where: { id },
    data: {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      ...(payload.level !== undefined ? { level: payload.level } : {}),
      ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
    select: DESIGNATION_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DESIGNATION_UPDATE,
    entity: 'Designation',
    entityId: id,
    meta,
    oldValue: { name: existing.name, code: existing.code, isActive: existing.isActive },
    newValue: { name: designation.name, code: designation.code, isActive: designation.isActive },
  });

  return designation;
}

export async function deleteDesignation(id: string, actor: Actor, meta: RequestMeta) {
  const designation = await prisma.designation.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, _count: { select: { employees: true } } },
  });
  if (!designation) throw ApiError.notFound('Designation not found');

  if (designation._count.employees > 0) {
    throw ApiError.conflict('This designation is still assigned to employees. Deactivate it instead of deleting it.');
  }

  await prisma.designation.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DESIGNATION_DELETE,
    entity: 'Designation',
    entityId: id,
    meta,
    oldValue: { name: designation.name, code: designation.code },
  });

  return { id };
}
