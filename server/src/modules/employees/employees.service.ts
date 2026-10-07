import { AuditAction, type EmployeeStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import type {
  ChangeEmployeeStatusBody,
  CreateEmployeeBody,
  ListEmployeesQuery,
  UpdateEmployeeBody,
} from './employees.validator';

export interface Actor {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}

const SUMMARY_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  phone: true,
  profilePhotoUrl: true,
  status: true,
  employmentType: true,
  joiningDate: true,
  exitDate: true,
  departmentId: true,
  designationId: true,
  managerId: true,
  user: { select: { id: true, role: true, status: true } },
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  gender: true,
  dateOfBirth: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  panNumber: true,
  aadhaarNumber: true,
  bankName: true,
  bankAccountNumber: true,
  bankIfsc: true,
  createdAt: true,
  updatedAt: true,
  directReports: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true },
    orderBy: { employeeCode: 'asc' as const },
  },
} as const;

const SORTABLE_FIELDS = new Set([
  'employeeCode',
  'firstName',
  'lastName',
  'email',
  'joiningDate',
  'status',
  'createdAt',
]);

/** Fields an employee without elevated rights may change on their own record. */
const SELF_EDITABLE_FIELDS = [
  'phone',
  'address',
  'city',
  'state',
  'postalCode',
  'emergencyContactName',
  'emergencyContactPhone',
  'profilePhotoUrl',
] as const;

function scopeFilter(scope: EmployeeScope): Prisma.EmployeeWhereInput {
  if (scope.mode === 'all') return {};
  if (!scope.employeeIds || scope.employeeIds.length === 0) return { id: { in: [] } };
  return { id: { in: scope.employeeIds } };
}

function assertAccess(scope: EmployeeScope, employeeId: string): void {
  if (scope.mode === 'all') return;
  if (scope.employeeIds?.includes(employeeId)) return;
  throw ApiError.forbidden('You are not allowed to access this employee record');
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function nextEmployeeCode(): Promise<string> {
  const existing = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: 'SL' } },
    select: { employeeCode: true },
    orderBy: { employeeCode: 'desc' },
    take: 1,
  });

  const highest = existing
    .map((entry) => Number.parseInt(entry.employeeCode.replace(/^SL/, ''), 10))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0);

  let candidate = highest + 1;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = `SL${String(candidate).padStart(4, '0')}`;
    const clash = await prisma.employee.findUnique({ where: { employeeCode: code }, select: { id: true } });
    if (!clash) return code;
    candidate += 1;
  }

  throw ApiError.unprocessable('Could not allocate an employee code, please provide one manually');
}

export async function listEmployees(query: ListEmployeesQuery, scope: EmployeeScope) {
  const { page, limit, search, sortBy, sortOrder, departmentId, designationId, managerId, status, employmentType, unassigned } = query;

  const where: Prisma.EmployeeWhereInput = {
    AND: [
      scopeFilter(scope),
      {
        ...(departmentId ? { departmentId } : {}),
        ...(designationId ? { designationId } : {}),
        ...(managerId ? { managerId } : {}),
        ...(status ? { status: status as EmployeeStatus } : {}),
        ...(employmentType ? { employmentType: employmentType } : {}),
        ...(unassigned ? { departmentId: null } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { employeeCode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    ],
  };

  const orderBy: Prisma.EmployeeOrderByWithRelationInput = SORTABLE_FIELDS.has(sortBy ?? '')
    ? { [sortBy as string]: sortOrder }
    : { employeeCode: 'asc' };

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getEmployee(id: string, scope: EmployeeScope, actor: Actor) {
  assertAccess(scope, id);

  const employee = await prisma.employee.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!employee) throw ApiError.notFound('Employee not found');

  const canSeeSensitive =
    actor.employeeId === id || hasPermission(actor.role, PERMISSIONS.EMPLOYEE_READ_ANY);

  return canSeeSensitive ? employee : redactPrivateFields(employee);
}

/** Document and banking identifiers are hidden from team-level viewers. */
function redactPrivateFields<T extends Record<string, unknown>>(employee: T): T {
  return {
    ...employee,
    panNumber: null,
    aadhaarNumber: null,
    bankAccountNumber: null,
  };
}

export async function createEmployee(payload: CreateEmployeeBody, actor: Actor, meta: RequestMeta) {
  const clash = await prisma.employee.findFirst({
    where: { OR: [{ email: payload.email }, ...(payload.employeeCode ? [{ employeeCode: payload.employeeCode }] : [])] },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('An employee with this email or employee code already exists');

  await assertReferences(payload.departmentId, payload.designationId, payload.managerId);

  if (payload.exitDate && payload.exitDate < payload.joiningDate) {
    throw ApiError.unprocessable('Exit date cannot be before the joining date');
  }

  const employeeCode = payload.employeeCode ?? (await nextEmployeeCode());

  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      firstName: payload.firstName,
      middleName: payload.middleName ?? null,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone ?? null,
      gender: (payload.gender ?? null),
      dateOfBirth: payload.dateOfBirth ? toDate(payload.dateOfBirth) : null,
      address: payload.address ?? null,
      city: payload.city ?? null,
      state: payload.state ?? null,
      postalCode: payload.postalCode ?? null,
      country: payload.country,
      emergencyContactName: payload.emergencyContactName ?? null,
      emergencyContactPhone: payload.emergencyContactPhone ?? null,
      joiningDate: toDate(payload.joiningDate),
      exitDate: payload.exitDate ? toDate(payload.exitDate) : null,
      employmentType: payload.employmentType,
      status: payload.status as EmployeeStatus,
      departmentId: payload.departmentId ?? null,
      designationId: payload.designationId ?? null,
      managerId: payload.managerId ?? null,
      panNumber: payload.panNumber ?? null,
      aadhaarNumber: payload.aadhaarNumber ?? null,
      bankName: payload.bankName ?? null,
      bankAccountNumber: payload.bankAccountNumber ?? null,
      bankIfsc: payload.bankIfsc ?? null,
    },
    select: SUMMARY_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.EMPLOYEE_CREATE,
    entity: 'Employee',
    entityId: employee.id,
    meta,
    newValue: { employeeCode: employee.employeeCode, email: employee.email, status: employee.status },
  });

  return employee;
}

export async function updateEmployee(
  id: string,
  payload: UpdateEmployeeBody,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  assertAccess(scope, id);

  const existing = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, email: true, employeeCode: true, managerId: true, departmentId: true, designationId: true },
  });
  if (!existing) throw ApiError.notFound('Employee not found');

  const isSelf = actor.employeeId === id;
  const canEditAnything = hasPermission(actor.role, PERMISSIONS.EMPLOYEE_UPDATE);

  if (!canEditAnything) {
    if (!isSelf) throw ApiError.forbidden('You do not have permission to update other employee records');

    const blocked = Object.keys(payload).filter((key) => !(SELF_EDITABLE_FIELDS as readonly string[]).includes(key));
    if (blocked.length > 0) {
      throw ApiError.forbidden('You can only update your contact details and address');
    }
  }

  if (payload.email && payload.email !== existing.email) {
    const emailClash = await prisma.employee.findFirst({ where: { email: payload.email, id: { not: id } }, select: { id: true } });
    if (emailClash) throw ApiError.conflict('Another employee already uses this email address');
  }

  await assertReferences(payload.departmentId, payload.designationId, payload.managerId, id);

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(payload.firstName !== undefined ? { firstName: payload.firstName } : {}),
      ...(payload.middleName !== undefined ? { middleName: payload.middleName ?? null } : {}),
      ...(payload.lastName !== undefined ? { lastName: payload.lastName } : {}),
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone ?? null } : {}),
      ...(payload.gender !== undefined ? { gender: (payload.gender ?? null) } : {}),
      ...(payload.dateOfBirth !== undefined
        ? { dateOfBirth: payload.dateOfBirth ? toDate(payload.dateOfBirth) : null }
        : {}),
      ...(payload.address !== undefined ? { address: payload.address ?? null } : {}),
      ...(payload.city !== undefined ? { city: payload.city ?? null } : {}),
      ...(payload.state !== undefined ? { state: payload.state ?? null } : {}),
      ...(payload.postalCode !== undefined ? { postalCode: payload.postalCode ?? null } : {}),
      ...(payload.country !== undefined ? { country: payload.country } : {}),
      ...(payload.emergencyContactName !== undefined
        ? { emergencyContactName: payload.emergencyContactName ?? null }
        : {}),
      ...(payload.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: payload.emergencyContactPhone ?? null }
        : {}),
      ...(payload.employmentType !== undefined ? { employmentType: payload.employmentType } : {}),
      ...(payload.departmentId !== undefined ? { departmentId: payload.departmentId ?? null } : {}),
      ...(payload.designationId !== undefined ? { designationId: payload.designationId ?? null } : {}),
      ...(payload.managerId !== undefined ? { managerId: payload.managerId ?? null } : {}),
      ...(payload.panNumber !== undefined ? { panNumber: payload.panNumber ?? null } : {}),
      ...(payload.aadhaarNumber !== undefined ? { aadhaarNumber: payload.aadhaarNumber ?? null } : {}),
      ...(payload.bankName !== undefined ? { bankName: payload.bankName ?? null } : {}),
      ...(payload.bankAccountNumber !== undefined ? { bankAccountNumber: payload.bankAccountNumber ?? null } : {}),
      ...(payload.bankIfsc !== undefined ? { bankIfsc: payload.bankIfsc ?? null } : {}),
      ...(payload.profilePhotoUrl !== undefined ? { profilePhotoUrl: payload.profilePhotoUrl ?? null } : {}),
    },
    select: SUMMARY_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.EMPLOYEE_UPDATE,
    entity: 'Employee',
    entityId: id,
    meta,
    oldValue: { email: existing.email, departmentId: existing.departmentId, managerId: existing.managerId },
    newValue: { email: updated.email, departmentId: updated.departmentId, managerId: updated.managerId },
  });

  return updated;
}

export async function changeEmployeeStatus(
  id: string,
  payload: ChangeEmployeeStatusBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, status: true, joiningDate: true, user: { select: { id: true } } },
  });
  if (!existing) throw ApiError.notFound('Employee not found');

  const exitDate = payload.exitDate ? toDate(payload.exitDate) : null;
  if (exitDate && exitDate < existing.joiningDate) {
    throw ApiError.unprocessable('Exit date cannot be before the joining date');
  }

  const linkedUserId = existing.user?.id ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({
      where: { id },
      data: {
        status: payload.status as EmployeeStatus,
        ...(payload.status === 'TERMINATED' || payload.status === 'RESIGNED' ? { exitDate: exitDate ?? new Date() } : {}),
        ...(payload.status === 'ACTIVE' ? { exitDate: null } : {}),
      },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true, exitDate: true },
    });

    if (linkedUserId && payload.status !== 'ACTIVE') {
      await tx.user.update({
        where: { id: linkedUserId },
        data: {
          status: payload.status === 'TERMINATED' || payload.status === 'RESIGNED' ? 'INACTIVE' : 'SUSPENDED',
          tokenVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: linkedUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (linkedUserId && payload.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await tx.user.update({
        where: { id: linkedUserId },
        data: { status: 'ACTIVE', lastLoginAt: null },
      });
    }

    return employee;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.EMPLOYEE_STATUS_CHANGE,
    entity: 'Employee',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: updated.status, reason: payload.reason ?? null, exitDate: updated.exitDate },
  });

  return updated;
}

export async function deleteEmployee(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, employeeCode: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Employee not found');

  if (existing.status !== 'RESIGNED' && existing.status !== 'TERMINATED') {
    throw ApiError.unprocessable('Only resigned or terminated employees can be removed. Change the status first.');
  }

  const [attendance, leaves, payslips] = await Promise.all([
    prisma.attendance.count({ where: { employeeId: id } }),
    prisma.leaveRequest.count({ where: { employeeId: id } }),
    prisma.payslip.count({ where: { employeeId: id } }),
  ]);

  if (attendance + leaves + payslips > 0) {
    throw ApiError.conflict(
      'This employee has attendance, leave or payroll history and cannot be removed. Records are retained for audit purposes.',
    );
  }

  await prisma.employee.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.EMPLOYEE_DELETE,
    entity: 'Employee',
    entityId: id,
    meta,
    oldValue: { employeeCode: existing.employeeCode, status: existing.status },
  });

  return { id };
}

async function assertReferences(
  departmentId: string | undefined,
  designationId: string | undefined,
  managerId: string | undefined,
  employeeId?: string,
): Promise<void> {
  if (departmentId) {
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, isActive: true } });
    if (!department) throw ApiError.unprocessable('The selected department does not exist');
    if (!department.isActive) throw ApiError.unprocessable('The selected department is not active');
  }

  if (designationId) {
    const designation = await prisma.designation.findUnique({ where: { id: designationId }, select: { id: true, isActive: true } });
    if (!designation) throw ApiError.unprocessable('The selected designation does not exist');
    if (!designation.isActive) throw ApiError.unprocessable('The selected designation is not active');
  }

  if (managerId) {
    if (employeeId && managerId === employeeId) throw ApiError.unprocessable('An employee cannot report to themselves');
    const manager = await prisma.employee.findUnique({
      where: { id: managerId },
      select: { id: true, status: true, managerId: true },
    });
    if (!manager) throw ApiError.unprocessable('The selected manager does not exist');
    if (manager.status !== 'ACTIVE') throw ApiError.unprocessable('The selected manager is not active');
    if (employeeId && manager.managerId === employeeId) throw ApiError.unprocessable('This would create a reporting loop');
  }
}
