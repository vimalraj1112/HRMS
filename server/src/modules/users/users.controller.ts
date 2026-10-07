import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as usersService from './users.service';
import type {
  CreateUserBody,
  ListUsersQuery,
  ResetPasswordBody,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
} from './users.validator';

export async function listUsersController(req: Request, res: Response): Promise<void> {
  const { items, meta } = await usersService.listUsers(getQuery<ListUsersQuery>(req));
  sendPaginated(res, items, meta, 'Users retrieved');
}

export async function getUserController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await usersService.getUserById(id), 'User retrieved');
}

export async function createUserController(req: Request, res: Response): Promise<void> {
  const user = await usersService.createUser(req.validated?.body as CreateUserBody, {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
  }, getRequestMeta(req));
  sendCreated(res, user, 'User created');
}

export async function updateRoleController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const user = await usersService.updateUserRole(id, req.validated?.body as UpdateUserRoleBody, {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: (req.user?.role ?? 'EMPLOYEE') as never,
  }, getRequestMeta(req));
  sendSuccess(res, user, 'Role updated');
}

export async function updateStatusController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const user = await usersService.updateUserStatus(id, req.validated?.body as UpdateUserStatusBody, {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
  }, getRequestMeta(req));
  sendSuccess(res, user, 'User status updated');
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const result = await usersService.resetUserPassword(id, req.validated?.body as ResetPasswordBody, {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
  }, getRequestMeta(req));

  sendSuccess(
    res,
    result,
    result.temporaryPassword
      ? 'Password reset. Share this one-time password securely; it will not be shown again.'
      : 'Password reset. The user must set a new password at next sign-in.',
  );
}
