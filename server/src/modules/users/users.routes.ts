import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createUserController,
  getUserController,
  listUsersController,
  resetPasswordController,
  updateRoleController,
  updateStatusController,
} from './users.controller';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from './users.validator';

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get('/', requirePermission(PERMISSIONS.USER_READ), validate({ query: listUsersQuerySchema }), listUsersController);
usersRouter.post('/', requirePermission(PERMISSIONS.USER_MANAGE), validate({ body: createUserSchema }), createUserController);
usersRouter.get('/:id', requirePermission(PERMISSIONS.USER_READ), validate({ params: userIdParamSchema }), getUserController);
usersRouter.patch(
  '/:id/role',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: userIdParamSchema, body: updateUserRoleSchema }),
  updateRoleController,
);
usersRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: userIdParamSchema, body: updateUserStatusSchema }),
  updateStatusController,
);
usersRouter.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: userIdParamSchema, body: resetPasswordSchema }),
  resetPasswordController,
);
