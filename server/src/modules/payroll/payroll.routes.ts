import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createSalaryStructureController,
  deleteSalaryStructureController,
  getPayslipController,
  getSalaryStructureController,
  listPayrollRunsController,
  listPayslipsController,
  listSalaryStructuresController,
  lockPayrollRunController,
  processPayrollController,
  updateSalaryStructureController,
} from './payroll.controller';
import {
  createSalaryStructureSchema,
  listPayrollRunsQuerySchema,
  listPayslipsQuerySchema,
  listSalaryStructuresQuerySchema,
  payrollIdParamSchema,
  processPayrollSchema,
  updateSalaryStructureSchema,
} from './payroll.validator';

export const payrollRouter = Router();

payrollRouter.use(authenticate);

payrollRouter.get(
  '/salary-structures',
  validate({ query: listSalaryStructuresQuerySchema }),
  listSalaryStructuresController,
);

payrollRouter.get(
  '/salary-structures/:id',
  validate({ params: payrollIdParamSchema }),
  getSalaryStructureController,
);

payrollRouter.post(
  '/salary-structures',
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate({ body: createSalaryStructureSchema }),
  createSalaryStructureController,
);

payrollRouter.patch(
  '/salary-structures/:id',
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate({ params: payrollIdParamSchema, body: updateSalaryStructureSchema }),
  updateSalaryStructureController,
);

payrollRouter.delete(
  '/salary-structures/:id',
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate({ params: payrollIdParamSchema }),
  deleteSalaryStructureController,
);

payrollRouter.get(
  '/runs',
  requirePermission(PERMISSIONS.PAYROLL_READ),
  validate({ query: listPayrollRunsQuerySchema }),
  listPayrollRunsController,
);

payrollRouter.post(
  '/runs/process',
  requirePermission(PERMISSIONS.PAYROLL_PROCESS),
  validate({ body: processPayrollSchema }),
  processPayrollController,
);

payrollRouter.post(
  '/runs/:id/lock',
  requirePermission(PERMISSIONS.PAYROLL_LOCK),
  validate({ params: payrollIdParamSchema }),
  lockPayrollRunController,
);

payrollRouter.get(
  '/payslips',
  validate({ query: listPayslipsQuerySchema }),
  listPayslipsController,
);

payrollRouter.get(
  '/payslips/:id',
  validate({ params: payrollIdParamSchema }),
  getPayslipController,
);