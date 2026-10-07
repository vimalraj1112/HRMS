import { AuditAction, type User } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { hashToken, issueTokens, verifyRefreshToken } from '../../utils/jwt';
import { hashPassword, verifyPassword } from '../../utils/password';
import type { AuthSession, AuthUserPayload } from './auth.types';
import type { ChangePasswordBody, LoginBody } from './auth.validator';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  employeeId: true,
  mustChangePassword: true,
  passwordChangedAt: true,
  tokenVersion: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      profilePhotoUrl: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  },
} as const;

type UserWithEmployee = Pick<
  User,
  'id' | 'email' | 'role' | 'status' | 'employeeId' | 'mustChangePassword' | 'passwordChangedAt' | 'tokenVersion'
> & { employee: AuthUserPayload['employee'] };

function sanitizeUser(user: UserWithEmployee): AuthUserPayload {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    employee: user.employee,
  };
}

async function purgeExpiredSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }).catch(() => undefined);
}

export async function login(credentials: LoginBody, meta: RequestMeta): Promise<AuthSession> {
  const email = credentials.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...USER_SELECT, passwordHash: true, failedLoginAttempts: true, lockedUntil: true },
  });

  if (!user) {
    await recordAudit({
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      userEmail: email,
      meta,
      newValue: { reason: 'unknown_email' },
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    throw ApiError.tooManyRequests(`Account is locked. Try again in ${minutes} minute(s).`);
  }

  const passwordMatches = await verifyPassword(credentials.password, user.passwordHash);

  if (!passwordMatches) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000) : null,
      },
    });

    await recordAudit({
      userId: user.id,
      userEmail: user.email,
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      entityId: user.id,
      meta,
      newValue: { attempts, locked: shouldLock },
    });

    if (shouldLock) {
      throw ApiError.tooManyRequests(
        `Too many failed attempts. Your account is locked for ${env.LOGIN_LOCK_MINUTES} minutes.`,
      );
    }

    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Your account is not active. Contact your administrator.');
  }

  const tokens = issueTokens(user);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(tokens.refreshToken),
        expiresAt: tokens.refreshTokenExpiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    }),
  ]);

  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: AuditAction.LOGIN,
    entity: 'User',
    entityId: user.id,
    meta,
  });

  void purgeExpiredSessions();

  const { passwordHash: _passwordHash, failedLoginAttempts: _attempts, lockedUntil: _locked, ...safe } = user;

  return {
    user: sanitizeUser(safe),
    tokens: { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn },
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
}

export async function rotateRefreshToken(
  refreshToken: string | undefined,
  meta: RequestMeta,
): Promise<AuthSession> {
  if (!refreshToken) throw ApiError.unauthorized('Refresh token is missing');

  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  const now = new Date();

  const isInvalid = !stored || stored.revokedAt !== null || stored.expiresAt < now || stored.userId !== payload.sub;

  if (isInvalid) {
    if (stored) {
      await prisma.refreshToken.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: now },
      });
      await recordAudit({
        userId: payload.sub,
        action: AuditAction.TOKEN_REFRESH,
        entity: 'RefreshToken',
        entityId: stored.id,
        meta,
        newValue: { outcome: 'reuse_detected', allSessionsRevoked: true },
      });
      logger.warn({ userId: payload.sub }, 'Refresh token reuse detected — all sessions revoked');
    }

    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: USER_SELECT });

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Your account is not active.');

  const tokens = issueTokens(user);

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: now } }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(tokens.refreshToken),
        expiresAt: tokens.refreshTokenExpiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    }),
  ]);

  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: AuditAction.TOKEN_REFRESH,
    entity: 'RefreshToken',
    entityId: stored.id,
    meta,
    newValue: { outcome: 'rotated' },
  });

  return {
    user: sanitizeUser(user),
    tokens: { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn },
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
}

export async function logout(userId: string, refreshToken: string | undefined, meta: RequestMeta): Promise<void> {
  if (refreshToken) {
    await prisma.refreshToken
      .updateMany({
        where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  } else {
    await prisma.refreshToken
      .updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  await recordAudit({ userId, action: AuditAction.LOGOUT, entity: 'User', entityId: userId, meta });
}

export async function logoutAll(userId: string, meta: RequestMeta): Promise<void> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    userId,
    action: AuditAction.LOGOUT,
    entity: 'User',
    entityId: userId,
    meta,
    newValue: { sessionsRevoked: result.count, scope: 'all_devices' },
  });
}

export async function getCurrentUser(userId: string): Promise<AuthUserPayload> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) throw ApiError.notFound('Account not found');
  return sanitizeUser(user);
}

export async function changePassword(
  userId: string,
  payload: ChangePasswordBody,
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) throw ApiError.notFound('Account not found');

  const matches = await verifyPassword(payload.currentPassword, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  const passwordHash = await hashPassword(payload.newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);

  await recordAudit({
    userId,
    userEmail: user.email,
    action: AuditAction.PASSWORD_CHANGE,
    entity: 'User',
    entityId: userId,
    meta,
  });
}
