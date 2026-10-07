import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as auditService from './audit.service';
import type { ListAuditLogsQuery } from './audit.validator';

export async function listAuditLogsController(req: Request, res: Response): Promise<void> {
  const result = await auditService.listAuditLogs(getQuery<ListAuditLogsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Audit logs retrieved', {
    facets: result.facets,
  });
}

export async function getAuditLogController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  const entry = await auditService.getAuditLog(id);
  if (!entry) throw ApiError.notFound('Audit log entry not found');

  sendSuccess(res, entry, 'Audit log entry retrieved');
}