import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import type { Actor } from '../leave/leave.service';
import * as holidaysService from './holidays.service';
import type { CreateHolidayBody, ListHolidaysQuery, UpdateHolidayBody } from './holidays.validator';

function actorOf(req: Request): Actor {
  return {
    id: req.user?.id ?? '',
    email: req.user?.email ?? '',
    role: req.user?.role ?? 'EMPLOYEE',
    employeeId: req.user?.employeeId ?? null,
  };
}

export async function listHolidaysController(req: Request, res: Response): Promise<void> {
  const result = await holidaysService.listHolidays(getQuery<ListHolidaysQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Holidays retrieved');
}

export async function getHolidayController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await holidaysService.getHoliday(id), 'Holiday retrieved');
}

export async function createHolidayController(req: Request, res: Response): Promise<void> {
  const holiday = await holidaysService.createHoliday(
    req.validated?.body as CreateHolidayBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, holiday, 'Holiday created');
}

export async function updateHolidayController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const holiday = await holidaysService.updateHoliday(
    id,
    req.validated?.body as UpdateHolidayBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, holiday, 'Holiday updated');
}

export async function deleteHolidayController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await holidaysService.deleteHoliday(id, actorOf(req), getRequestMeta(req)), 'Holiday removed');
}
