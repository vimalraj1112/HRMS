import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  exportReportController,
  getAttendanceReportController,
  getHeadcountReportController,
  getOverviewReportController,
  getLeaveReportController,
  getPayrollReportController,
} from './reports.controller';
import {
  exportReportQuerySchema,
  payrollReportQuerySchema,
  rangeQuerySchema,
} from './reports.validator';

export const reportsRouter = Router();

reportsRouter.use(authenticate);

reportsRouter.get(
  '/overview',
  requirePermission(PERMISSIONS.REPORTS_HR),
  validate({ query: rangeQuerySchema }),
  getOverviewReportController,
);

reportsRouter.get(
  '/headcount',
  requirePermission(PERMISSIONS.REPORTS_HR),
  validate({ query: rangeQuerySchema }),
  getHeadcountReportController,
);

reportsRouter.get(
  '/attendance',
  requirePermission(PERMISSIONS.REPORTS_HR),
  validate({ query: rangeQuerySchema }),
  getAttendanceReportController,
);

reportsRouter.get(
  '/leave',
  requirePermission(PERMISSIONS.REPORTS_HR),
  validate({ query: rangeQuerySchema }),
  getLeaveReportController,
);

reportsRouter.get(
  '/payroll',
  requirePermission(PERMISSIONS.REPORTS_FINANCE),
  validate({ query: payrollReportQuerySchema }),
  getPayrollReportController,
);

reportsRouter.get(
  '/export',
  requirePermission(PERMISSIONS.REPORTS_HR, PERMISSIONS.REPORTS_FINANCE),
  validate({ query: exportReportQuerySchema }),
  exportReportController,
);
