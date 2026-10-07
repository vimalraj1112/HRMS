import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as departmentsService from './departments.service';
import type { CreateDepartmentBody, ListDepartmentsQuery, UpdateDepartmentBody } from './departments.validator';

const actorOf = (req: Request) => ({ id: req.user?.id ?? '', email: req.user?.email ?? '' });

export async function listDepartmentsController(req: Request, res: Response): Promise<void> {
  const { items, meta } = await departmentsService.listDepartments(getQuery<ListDepartmentsQuery>(req));
  sendPaginated(res, items, meta, 'Departments retrieved');
}

export async function getDepartmentController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await departmentsService.getDepartmentById(id), 'Department retrieved');
}

export async function createDepartmentController(req: Request, res: Response): Promise<void> {
  const department = await departmentsService.createDepartment(
    req.validated?.body as CreateDepartmentBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, department, 'Department created');
}

export async function updateDepartmentController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const department = await departmentsService.updateDepartment(
    id,
    req.validated?.body as UpdateDepartmentBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, department, 'Department updated');
}

export async function deleteDepartmentController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await departmentsService.deleteDepartment(id, actorOf(req), getRequestMeta(req)), 'Department removed');
}
