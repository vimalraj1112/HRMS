import type { Request, Response } from 'express';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import {
  assignAsset,
  createAsset,
  deleteAsset,
  getAsset,
  getAssetHistory,
  getAssetStats,
  listAssets,
  listMyAssetHistory,
  returnAsset,
  updateAsset,
  type Actor,
  type AssetScope,
} from './assets.service';
import type {
  AssignAssetBody,
  CreateAssetBody,
  ListAssetsQuery,
  MyAssetsQuery,
  ReturnAssetBody,
  UpdateAssetBody,
} from './assets.validator';

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

function scopeOf(req: Request): AssetScope {
  if (!req.user) throw ApiError.unauthorized();
  return {
    readAll: hasPermission(req.user.role, PERMISSIONS.ASSET_READ_ANY),
    employeeId: req.user.employeeId,
  };
}

export async function listAssetsController(req: Request, res: Response): Promise<void> {
  const result = await listAssets(getQuery<ListAssetsQuery>(req), scopeOf(req));
  sendPaginated(res, result.items, result.meta);
}

export async function getAssetStatsController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getAssetStats(scopeOf(req)));
}

export async function listMyAssetHistoryController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const result = await listMyAssetHistory(req.user.employeeId, getQuery<MyAssetsQuery>(req));
  sendPaginated(res, result.items, result.meta);
}

export async function getAssetController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getAsset(getParams<{ id: string }>(req).id, scopeOf(req)));
}

export async function getAssetHistoryController(req: Request, res: Response): Promise<void> {
  const id = getParams<{ id: string }>(req).id;
  // Access check first: history must never leak to someone who cannot see the asset.
  await getAsset(id, scopeOf(req));
  sendSuccess(res, await getAssetHistory(id));
}

export async function createAssetController(req: Request, res: Response): Promise<void> {
  const asset = await createAsset(req.validated?.body as CreateAssetBody, actorOf(req), getRequestMeta(req));
  sendCreated(res, asset, 'Asset created');
}

export async function updateAssetController(req: Request, res: Response): Promise<void> {
  const asset = await updateAsset(
    getParams<{ id: string }>(req).id,
    req.validated?.body as UpdateAssetBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, asset, 'Asset updated');
}

export async function deleteAssetController(req: Request, res: Response): Promise<void> {
  const result = await deleteAsset(getParams<{ id: string }>(req).id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Asset deleted');
}

export async function assignAssetController(req: Request, res: Response): Promise<void> {
  const asset = await assignAsset(
    getParams<{ id: string }>(req).id,
    req.validated?.body as AssignAssetBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, asset, 'Asset assigned');
}

export async function returnAssetController(req: Request, res: Response): Promise<void> {
  const asset = await returnAsset(
    getParams<{ id: string }>(req).id,
    req.validated?.body as ReturnAssetBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, asset, 'Asset returned');
}
