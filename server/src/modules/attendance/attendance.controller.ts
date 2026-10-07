import type { Request, Response } from 'express';
import { resolveEmployeeScope, type EmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as attendanceService from './attendance.service';
import type {
  AttendanceSummaryQuery,
  CorrectAttendanceBody,
  ListAttendanceQuery,
  MarkAttendanceBody,
} from './attendance.validator';

function actorOf(req: Request): attendanceService.Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function listMyAttendanceController(req: Request, res: Response): Promise<void> {
  const employeeId = req.user?.employeeId ?? undefined;
  const scope: EmployeeScope = { mode: 'self', employeeIds: employeeId ? [employeeId] : [] };
  const query = getQuery<ListAttendanceQuery>(req);
  const result = await attendanceService.listAttendance({ ...query, employeeId }, scope);
  sendPaginated(res, result.items, result.meta, 'Your attendance retrieved');
}

export async function listTeamAttendanceController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await attendanceService.listAttendance(getQuery<ListAttendanceQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Team attendance retrieved');
}

export async function listAttendanceController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await attendanceService.listAttendance(getQuery<ListAttendanceQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Attendance retrieved');
}

export async function attendanceSummaryController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await attendanceService.attendanceSummary(
    getQuery<AttendanceSummaryQuery>(req),
    scope,
  );
  sendPaginated(res, result.items, result.meta, 'Attendance summary retrieved');
}

export async function markAttendanceController(req: Request, res: Response): Promise<void> {
  const record = await attendanceService.markAttendance(
    req.validated?.body as MarkAttendanceBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, record, 'Attendance recorded');
}

export async function correctAttendanceController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const record = await attendanceService.correctAttendance(
    id,
    req.validated?.body as CorrectAttendanceBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, record, 'Attendance corrected');
}
