import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

async function resolveUser(req: Request): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
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
          firstName: true,
          lastName: true,
          employeeCode: true,
          profilePhotoUrl: true,
          status: true,
          managerId: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Your account is not active. Contact your administrator.');
  if (user.employee && user.employee.status !== 'ACTIVE' && user.role === 'EMPLOYEE') {
    throw ApiError.forbidden('Your employee record is not active. Contact your administrator.');
  }
  if (payload.tokenVersion !== user.tokenVersion) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
  };
  req.authEmployee = user.employee;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  resolveUser(req)
    .then(() => next())
    .catch(next);
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  if (!extractBearerToken(req)) {
    next();
    return;
  }

  resolveUser(req)
    .then(() => next())
    .catch(() => next());
}
