import { AuditAction, type Role, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { hashPassword } from '../../utils/password';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import type {
  CreateUserBody,
  ListUsersQuery,
  ResetPasswordBody,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
} from './users.validator';

const USER_INCLUDE = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      profilePhotoUrl: true,
      status: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  },
} as const;

const SORTABLE_FIELDS = new Set(['email', 'role', 'status', 'createdAt', 'lastLoginAt']);

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, search, sortBy, sortOrder, role, status, unlinkedOnly } = query;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(unlinkedOnly ? { employeeId: null } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            {
              employee: {
                is: {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { employeeCode: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.UserOrderByWithRelationInput = SORTABLE_FIELDS.has(sortBy ?? '')
    ? { [sortBy as string]: sortOrder }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        employeeId: true,
        lastLoginAt: true,
        lockedUntil: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        ...USER_INCLUDE,
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      employeeId: true,
      lastLoginAt: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      ...USER_INCLUDE,
    },
  });

  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function createUser(payload: CreateUserBody, actor: { id: string; email: string }, meta: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  if (payload.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: { id: true, user: { select: { id: true } } },
    });
    if (!employee) throw ApiError.unprocessable('The selected employee does not exist');
    if (employee.user) throw ApiError.conflict('This employee already has a linked user account');
  }

  const passwordHash = await hashPassword(payload.password);

  const user = await prisma.user.create({
    data: {
      email: payload.email,
      passwordHash,
      role: payload.role,
      employeeId: payload.employeeId ?? null,
      mustChangePassword: payload.mustChangePassword,
      passwordChangedAt: new Date(),
    },
    select: { id: true, email: true, role: true, status: true, employeeId: true, mustChangePassword: true },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.USER_CREATE,
    entity: 'User',
    entityId: user.id,
    meta,
    newValue: { email: user.email, role: user.role, employeeId: user.employeeId },
  });

  return user;
}

export async function updateUserRole(
  id: string,
  payload: UpdateUserRoleBody,
  actor: { id: string; email: string; role: Role },
  meta: RequestMeta,
) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
  if (!user) throw ApiError.notFound('User not found');

  if (user.id === actor.id && payload.role !== actor.role) {
    throw ApiError.unprocessable('You cannot change your own role');
  }

  if (user.role === 'SUPER_ADMIN' && payload.role !== 'SUPER_ADMIN') {
    const superAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
    if (superAdmins <= 1) throw ApiError.unprocessable('At least one active SUPER_ADMIN must remain');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: payload.role },
    select: { id: true, email: true, role: true, status: true },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ROLE_CHANGE,
    entity: 'User',
    entityId: id,
    oldValue: { role: user.role },
    newValue: { role: updated.role },
    meta,
  });

  return updated;
}

export async function updateUserStatus(
  id: string,
  payload: UpdateUserStatusBody,
  actor: { id: string; email: string },
  meta: RequestMeta,
) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, status: true } });
  if (!user) throw ApiError.notFound('User not found');

  if (user.id === actor.id && payload.status !== 'ACTIVE') {
    throw ApiError.unprocessable('You cannot deactivate your own account');
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id },
      data: {
        status: payload.status,
        ...(payload.status === 'ACTIVE' ? { lockedUntil: null, failedLoginAttempts: 0 } : {}),
      },
      select: { id: true, email: true, role: true, status: true },
    });

    if (payload.status !== 'ACTIVE') {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
    }

    return result;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.USER_UPDATE,
    entity: 'User',
    entityId: id,
    oldValue: { status: user.status },
    newValue: { status: updated.status, reason: payload.reason ?? null },
    meta,
  });

  return updated;
}

export async function resetUserPassword(
  id: string,
  payload: ResetPasswordBody,
  actor: { id: string; email: string },
  meta: RequestMeta,
) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) throw ApiError.notFound('User not found');

  const temporaryPassword = payload.newPassword ? null : generateTemporaryPassword();
  const passwordHash = await hashPassword(payload.newPassword ?? (temporaryPassword as string));

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: payload.mustChangePassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PASSWORD_RESET,
    entity: 'User',
    entityId: id,
    meta,
    newValue: { mustChangePassword: payload.mustChangePassword, temporary: temporaryPassword !== null },
  });

  return {
    id: user.id,
    email: user.email,
    mustChangePassword: payload.mustChangePassword,
    temporaryPassword,
  };
}

function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = `${upper}${lower}${digits}${symbols}`;

  const pick = (source: string): string => source[Math.floor(Math.random() * source.length)] ?? 'A';
  const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  while (characters.length < 12) characters.push(pick(all));

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = characters[index];
    const swap = characters[swapIndex];
    if (current !== undefined && swap !== undefined) {
      characters[index] = swap;
      characters[swapIndex] = current;
    }
  }

  return characters.join('');
}
