import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as designationsService from './designations.service';
import type { CreateDesignationBody, ListDesignationsQuery, UpdateDesignationBody } from './designations.validator';

const actorOf = (req: Request) => ({ id: req.user?.id ?? '', email: req.user?.email ?? '' });

export async function listDesignationsController(req: Request, res: Response): Promise<void> {
  const { items, meta } = await designationsService.listDesignations(getQuery<ListDesignationsQuery>(req));
  sendPaginated(res, items, meta, 'Designations retrieved');
}

export async function getDesignationController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await designationsService.getDesignationById(id), 'Designation retrieved');
}

export async function createDesignationController(req: Request, res: Response): Promise<void> {
  const designation = await designationsService.createDesignation(
    req.validated?.body as CreateDesignationBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, designation, 'Designation created');
}

export async function updateDesignationController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const designation = await designationsService.updateDesignation(
    id,
    req.validated?.body as UpdateDesignationBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, designation, 'Designation updated');
}

export async function deleteDesignationController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await designationsService.deleteDesignation(id, actorOf(req), getRequestMeta(req)), 'Designation removed');
}
