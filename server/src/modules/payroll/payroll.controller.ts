import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as payrollService from './payroll.service';
import type { Actor } from '../leave/leave.service';
import type {
  CreateSalaryStructureBody,
  ListPayrollRunsQuery,
  ListPayslipsQuery,
  ListSalaryStructuresQuery,
  ProcessPayrollBody,
  UpdateSalaryStructureBody,
} from './payroll.validator';

function actorOf(req: Request): Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function listSalaryStructuresController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await payrollService.listSalaryStructures(getQuery<ListSalaryStructuresQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Salary structures retrieved');
}

export async function getSalaryStructureController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const scope = await resolveEmployeeScope(req);
  sendSuccess(res, await payrollService.getSalaryStructure(id, scope), 'Salary structure retrieved');
}

export async function createSalaryStructureController(req: Request, res: Response): Promise<void> {
  const structure = await payrollService.createSalaryStructure(
    req.validated?.body as CreateSalaryStructureBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, structure, 'Salary structure created');
}

export async function updateSalaryStructureController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const structure = await payrollService.updateSalaryStructure(
    id,
    req.validated?.body as UpdateSalaryStructureBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, structure, 'Salary structure updated');
}

export async function deleteSalaryStructureController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const result = await payrollService.deleteSalaryStructure(id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Salary structure removed');
}

export async function listPayrollRunsController(req: Request, res: Response): Promise<void> {
  const result = await payrollService.listPayrollRuns(getQuery<ListPayrollRunsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Payroll runs retrieved');
}

export async function processPayrollController(req: Request, res: Response): Promise<void> {
  const run = await payrollService.processPayroll(
    req.validated?.body as ProcessPayrollBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, run, 'Payroll processed');
}

export async function lockPayrollRunController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const run = await payrollService.lockPayrollRun(id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, run, 'Payroll run locked');
}

export async function listPayslipsController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await payrollService.listPayslips(getQuery<ListPayslipsQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Payslips retrieved');
}

export async function getPayslipController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const scope = await resolveEmployeeScope(req);
  const payslip = await payrollService.getPayslip(id, actorOf(req), scope, getRequestMeta(req));
  sendSuccess(res, payslip, 'Payslip retrieved');
}