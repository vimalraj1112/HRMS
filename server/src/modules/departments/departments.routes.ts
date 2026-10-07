import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createDepartmentController,
  deleteDepartmentController,
  getDepartmentController,
  listDepartmentsController,
  updateDepartmentController,
} from './departments.controller';
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
} from './departments.validator';

export const departmentsRouter = Router();

departmentsRouter.use(authenticate);

departmentsRouter.get(
  '/',
  requirePermission(PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ query: listDepartmentsQuerySchema }),
  listDepartmentsController,
);

departmentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ body: createDepartmentSchema }),
  createDepartmentController,
);

departmentsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ params: departmentIdParamSchema }),
  getDepartmentController,
);

departmentsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  updateDepartmentController,
);

departmentsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_MANAGE),
  validate({ params: departmentIdParamSchema }),
  deleteDepartmentController,
);
