import type { Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta, recordAudit } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as leaveService from './leave.service';
import type {
  AdjustBalanceBody,
  ApplyLeaveBody,
  CancelLeaveBody,
  CreateLeaveTypeBody,
  DecideLeaveBody,
  LeaveBalancesQuery,
  ListLeaveRequestsQuery,
  ListLeaveTypesQuery,
  RolloverBalancesQuery,
  UpdateLeaveTypeBody,
} from './leave.validator';

function actorOf(req: Request): leaveService.Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function applyLeaveController(req: Request, res: Response): Promise<void> {
  const request = await leaveService.applyLeave(
    req.validated?.body as ApplyLeaveBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, request, 'Leave request submitted');
}

export async function listMyRequestsController(req: Request, res: Response): Promise<void> {
  const result = await leaveService.listMyRequests(
    getQuery<ListLeaveRequestsQuery>(req),
    req.user?.employeeId ?? null,
  );
  sendPaginated(res, result.items, result.meta, 'Your leave requests retrieved');
}

export async function listRequestsController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await leaveService.listRequests(getQuery<ListLeaveRequestsQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Leave requests retrieved');
}

export async function listApprovalsController(req: Request, res: Response): Promise<void> {
  const result = await leaveService.listApprovals(getQuery<ListLeaveRequestsQuery>(req), actorOf(req));
  sendPaginated(res, result.items, result.meta, 'Pending approvals retrieved');
}

export async function getRequestController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const scope = await resolveEmployeeScope(req);
  sendSuccess(res, await leaveService.getRequest(id, scope), 'Leave request retrieved');
}

export async function decideRequestController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const request = await leaveService.decideRequest(
    id,
    req.validated?.body as DecideLeaveBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, request, 'Leave request updated');
}

export async function cancelRequestController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const request = await leaveService.cancelRequest(
    id,
    req.validated?.body as CancelLeaveBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, request, 'Leave request cancelled');
}

export async function myBalancesController(req: Request, res: Response): Promise<void> {
  const items = await leaveService.listBalances(getQuery<LeaveBalancesQuery>(req), req.user?.employeeId ?? '');
  sendSuccess(res, { items, year: items[0]?.year ?? null }, 'Leave balances retrieved');
}

export async function employeeBalancesController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await leaveService.listEmployeeBalances(id, getQuery<LeaveBalancesQuery>(req)), 'Leave balances retrieved');
}

export async function adjustBalanceController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(
    res,
    await leaveService.adjustBalance(id, req.validated?.body as AdjustBalanceBody, actorOf(req), getRequestMeta(req)),
    'Leave balance updated',
  );
}

export async function rolloverBalancesController(req: Request, res: Response): Promise<void> {
  const { fromYear, toYear } = getQuery<RolloverBalancesQuery>(req);
  const result = await leaveService.rolloverBalances(Number(fromYear), Number(toYear));

  await recordAudit({
    userId: req.user?.id ?? '',
    userEmail: req.user?.email ?? '',
    action: AuditAction.LEAVE_BALANCE_ROLLOVER,
    entity: 'LeaveBalance',
    meta: getRequestMeta(req),
    newValue: {
      fromYear,
      toYear,
      created: result.created,
      updated: result.kept,
      carried: result.carried.length,
    },
  });

  sendSuccess(res, result, 'Leave balances rolled forward');
}

export async function listLeaveTypesController(req: Request, res: Response): Promise<void> {
  const result = await leaveService.listLeaveTypes(getQuery<ListLeaveTypesQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Leave types retrieved');
}

export async function createLeaveTypeController(req: Request, res: Response): Promise<void> {
  const type = await leaveService.createLeaveType(
    req.validated?.body as CreateLeaveTypeBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, type, 'Leave type created');
}

export async function updateLeaveTypeController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const type = await leaveService.updateLeaveType(
    id,
    req.validated?.body as UpdateLeaveTypeBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, type, 'Leave type updated');
}

export async function deleteLeaveTypeController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await leaveService.deleteLeaveType(id, actorOf(req), getRequestMeta(req)), 'Leave type removed');
}
