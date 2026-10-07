import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendSuccess } from '../../utils/apiResponse';
import { getBody, getParams } from '../../utils/request';
import * as settingsService from './settings.service';
import type { Actor } from '../leave/leave.service';
import type { UpdateSettingBody } from './settings.validator';

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    employeeId: req.user.employeeId,
  };
}

export async function listSettingsController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await settingsService.listSettings(actorOf(req)), 'Settings retrieved');
}

export async function getSettingController(req: Request, res: Response): Promise<void> {
  const { key } = getParams<{ key: string }>(req);
  sendSuccess(res, await settingsService.getSetting(key, actorOf(req)), 'Setting retrieved');
}

export async function updateSettingController(req: Request, res: Response): Promise<void> {
  const { key } = getParams<{ key: string }>(req);
  const setting = await settingsService.updateSetting(
    key,
    getBody<UpdateSettingBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, setting, 'Setting updated');
}

export async function deleteSettingController(req: Request, res: Response): Promise<void> {
  const { key } = getParams<{ key: string }>(req);
  const result = await settingsService.deleteSetting(key, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Setting removed');
}
