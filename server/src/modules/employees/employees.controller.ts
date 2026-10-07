import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as employeesService from './employees.service';
import type {
  ChangeEmployeeStatusBody,
  CreateEmployeeBody,
  ListEmployeesQuery,
  UpdateEmployeeBody,
} from './employees.validator';

function actorOf(req: Request): employeesService.Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function listEmployeesController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const { items, meta } = await employeesService.listEmployees(getQuery<ListEmployeesQuery>(req), scope);
  sendPaginated(res, items, meta, 'Employees retrieved');
}

export async function getEmployeeController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const scope = await resolveEmployeeScope(req);
  sendSuccess(res, await employeesService.getEmployee(id, scope, actorOf(req)), 'Employee retrieved');
}

export async function createEmployeeController(req: Request, res: Response): Promise<void> {
  const employee = await employeesService.createEmployee(
    req.validated?.body as CreateEmployeeBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, employee, 'Employee created');
}

export async function updateEmployeeController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const scope = await resolveEmployeeScope(req);
  const employee = await employeesService.updateEmployee(
    id,
    req.validated?.body as UpdateEmployeeBody,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendSuccess(res, employee, 'Employee updated');
}

export async function changeStatusController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const employee = await employeesService.changeEmployeeStatus(
    id,
    req.validated?.body as ChangeEmployeeStatusBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, employee, 'Employee status updated');
}

export async function deleteEmployeeController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await employeesService.deleteEmployee(id, actorOf(req), getRequestMeta(req)), 'Employee removed');
}
