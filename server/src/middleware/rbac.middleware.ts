import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { hasAllPermissions, hasAnyPermission, hasPermission, type AppRole, type Permission } from '../config/rbac';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../config/prisma';

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    const allowed =
      permissions.length === 1
        ? hasPermission(user.role, permissions[0] as Permission)
        : hasAnyPermission(user.role, permissions);

    if (!allowed) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

export function requireAllPermissions(...permissions: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!hasAllPermissions(user.role, permissions)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!roles.includes(user.role as AppRole)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

export interface EmployeeScope {
  mode: 'all' | 'team' | 'self';
  employeeIds: string[] | null;
}

/**
 * Resolves which employees a request may read.
 * `all`   -> unrestricted (HR / Finance / Recruiter level roles)
 * `team`  -> the requester's own record plus their direct reports
 * `self`  -> the requester's own record only
 */
export async function resolveEmployeeScope(req: Request): Promise<EmployeeScope> {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  if (hasPermission(user.role, 'employee:read:any')) return { mode: 'all', employeeIds: null };

  if (!user.employeeId) return { mode: 'self', employeeIds: [] };

  if (hasPermission(user.role, 'employee:read:team')) {
    const reports = await prisma.employee.findMany({
      where: { managerId: user.employeeId, status: { not: 'TERMINATED' } },
      select: { id: true },
    });
    return { mode: 'team', employeeIds: [user.employeeId, ...reports.map((report) => report.id)] };
  }

  return { mode: 'self', employeeIds: [user.employeeId] };
}

export function assertEmployeeAccess(scope: EmployeeScope, employeeId: string): void {
  if (scope.mode === 'all') return;
  if (scope.employeeIds?.includes(employeeId)) return;
  throw ApiError.forbidden('You are not allowed to access this employee record');
}

/** An employee may only act on their own record unless they hold an elevated permission. */
export function assertSelfOrPermission(req: Request, employeeId: string, permission: Permission): void {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();
  if (user.employeeId === employeeId) return;
  if (hasPermission(user.role, permission)) return;
  throw ApiError.forbidden('You can only access your own records');
}
