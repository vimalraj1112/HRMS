import { AuditAction, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { CreateDepartmentBody, ListDepartmentsQuery, UpdateDepartmentBody } from './departments.validator';

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  headId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  head: { select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true } },
  _count: { select: { employees: true } },
} as const;

const SORTABLE_FIELDS = new Set(['name', 'code', 'createdAt']);

interface Actor {
  id: string;
  email: string;
}

export async function listDepartments(query: ListDepartmentsQuery) {
  const { page, limit, search, sortBy, sortOrder, includeInactive } = query;

  const where: Prisma.DepartmentWhereInput = {
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

  const orderBy: Prisma.DepartmentOrderByWithRelationInput = SORTABLE_FIELDS.has(sortBy ?? '')
    ? { [sortBy as string]: sortOrder }
    : { name: 'asc' };

  const [items, total] = await Promise.all([
    prisma.department.findMany({ where, select: DEPARTMENT_SELECT, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.department.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getDepartmentById(id: string) {
  const department = await prisma.department.findUnique({ where: { id }, select: DEPARTMENT_SELECT });
  if (!department) throw ApiError.notFound('Department not found');
  return department;
}

export async function createDepartment(payload: CreateDepartmentBody, actor: Actor, meta: RequestMeta) {
  const clash = await prisma.department.findFirst({
    where: { OR: [{ name: payload.name }, { code: payload.code }] },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('A department with this name or code already exists');

  await assertHead(payload.headId);

  const department = await prisma.department.create({
    data: {
      name: payload.name,
      code: payload.code,
      description: payload.description ?? null,
      headId: payload.headId ?? null,
      isActive: payload.isActive,
    },
    select: DEPARTMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DEPARTMENT_CREATE,
    entity: 'Department',
    entityId: department.id,
    meta,
    newValue: { name: department.name, code: department.code },
  });

  return department;
}

export async function updateDepartment(
  id: string,
  payload: UpdateDepartmentBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.department.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!existing) throw ApiError.notFound('Department not found');

  if (payload.name || payload.code) {
    const clash = await prisma.department.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(payload.name ? [{ name: payload.name }] : []),
          ...(payload.code ? [{ code: payload.code }] : []),
        ],
      },
      select: { id: true },
    });
    if (clash) throw ApiError.conflict('A department with this name or code already exists');
  }

  await assertHead(payload.headId);

  if (payload.isActive === false) {
    const activeEmployees = await prisma.employee.count({ where: { departmentId: id, status: 'ACTIVE' } });
    if (activeEmployees > 0) {
      throw ApiError.unprocessable(
        `Move the ${activeEmployees} active employee(s) out of this department before deactivating it`,
      );
    }
  }

  const department = await prisma.department.update({
    where: { id },
    data: {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
      ...(payload.headId !== undefined ? { headId: payload.headId ?? null } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
    select: DEPARTMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DEPARTMENT_UPDATE,
    entity: 'Department',
    entityId: id,
    meta,
    oldValue: { name: existing.name, code: existing.code, isActive: existing.isActive },
    newValue: { name: department.name, code: department.code, isActive: department.isActive },
  });

  return department;
}

export async function deleteDepartment(id: string, actor: Actor, meta: RequestMeta) {
  const department = await prisma.department.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, _count: { select: { employees: true } } },
  });
  if (!department) throw ApiError.notFound('Department not found');

  if (department._count.employees > 0) {
    throw ApiError.conflict('This department still has employees. Deactivate it instead of deleting it.');
  }

  await prisma.department.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DEPARTMENT_DELETE,
    entity: 'Department',
    entityId: id,
    meta,
    oldValue: { name: department.name, code: department.code },
  });

  return { id };
}

async function assertHead(headId: string | undefined): Promise<void> {
  if (!headId) return;
  const head = await prisma.employee.findUnique({ where: { id: headId }, select: { id: true, status: true } });
  if (!head) throw ApiError.unprocessable('The selected department head does not exist');
  if (head.status !== 'ACTIVE') throw ApiError.unprocessable('The selected department head is not active');
}
