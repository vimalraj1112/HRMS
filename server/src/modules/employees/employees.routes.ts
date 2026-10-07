import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  changeStatusController,
  createEmployeeController,
  deleteEmployeeController,
  getEmployeeController,
  listEmployeesController,
  updateEmployeeController,
} from './employees.controller';
import {
  changeEmployeeStatusSchema,
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from './employees.validator';

export const employeesRouter = Router();

employeesRouter.use(authenticate);

employeesRouter.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_READ_ANY, PERMISSIONS.EMPLOYEE_READ_TEAM, PERMISSIONS.EMPLOYEE_READ_OWN),
  validate({ query: listEmployeesQuerySchema }),
  listEmployeesController,
);

employeesRouter.post(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_CREATE),
  validate({ body: createEmployeeSchema }),
  createEmployeeController,
);

employeesRouter.get('/:id', validate({ params: employeeIdParamSchema }), getEmployeeController);

employeesRouter.patch(
  '/:id',
  validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }),
  updateEmployeeController,
);

employeesRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.EMPLOYEE_STATUS),
  validate({ params: employeeIdParamSchema, body: changeEmployeeStatusSchema }),
  changeStatusController,
);

employeesRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.EMPLOYEE_DELETE),
  validate({ params: employeeIdParamSchema }),
  deleteEmployeeController,
);
