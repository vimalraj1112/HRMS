import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { sendSuccess } from '../../utils/apiResponse';
import * as dashboardService from './dashboard.service';
import type { Actor } from '../leave/leave.service';

function actorOf(req: Request): Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  sendSuccess(res, await dashboardService.getDashboard(actorOf(req), scope), 'Dashboard retrieved');
}
