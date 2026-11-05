import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { weeklyTimesheetsController } from './timesheet.controller';
import { weeklyTimesheetQuerySchema } from './timesheet.validator';

export const timesheetRouter = Router();

timesheetRouter.use(authenticate);

timesheetRouter.get(
  '/week',
  requirePermission(
    PERMISSIONS.TIMESHEET_READ_OWN,
    PERMISSIONS.TIMESHEET_READ_TEAM,
    PERMISSIONS.TIMESHEET_READ_ANY,
  ),
  validate({ query: weeklyTimesheetQuerySchema }),
  weeklyTimesheetsController,
);
