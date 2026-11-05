import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { sendSuccess } from '../../utils/apiResponse';
import { getQuery } from '../../utils/request';
import * as timesheetService from './timesheet.service';
import type { WeeklyTimesheetQuery } from './timesheet.validator';

export async function weeklyTimesheetsController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await timesheetService.listWeeklyTimesheets(
    getQuery<WeeklyTimesheetQuery>(req),
    scope,
  );
  sendSuccess(res, result, 'Weekly timesheets retrieved');
}
