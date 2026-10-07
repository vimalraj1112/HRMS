import { AuditAction } from '@prisma/client';
import type { Request, Response } from 'express';
import { hasPermission } from '../../config/rbac';
import { getRequestMeta, recordAudit, redactForAudit } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendSuccess } from '../../utils/apiResponse';
import { getQuery } from '../../utils/request';
import * as reportsService from './reports.service';
import type { ExportReportQuery, PayrollReportQuery, RangeQuery } from './reports.validator';

async function rangeReport(report: 'overview' | 'headcount' | 'attendance' | 'leave', req: Request) {
  const query = getQuery<RangeQuery>(req);
  return reportsService.buildReport({ report, from: query.from, to: query.to });
}

export async function getOverviewReportController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rangeReport('overview', req), 'Report generated');
}

export async function getHeadcountReportController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rangeReport('headcount', req), 'Report generated');
}

export async function getAttendanceReportController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rangeReport('attendance', req), 'Report generated');
}

export async function getLeaveReportController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rangeReport('leave', req), 'Report generated');
}

export async function getPayrollReportController(req: Request, res: Response): Promise<void> {
  const query = getQuery<PayrollReportQuery>(req);
  sendSuccess(
    res,
    await reportsService.buildReport({ report: 'payroll', month: query.month, year: query.year }),
    'Report generated',
  );
}

/**
 * The route accepts either report permission, so the exact report is checked
 * here: finance owns payroll, HR owns everything else.
 */
export async function exportReportController(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  const query = getQuery<ExportReportQuery>(req);
  if (!hasPermission(user.role, reportsService.REPORT_PERMISSIONS[query.report])) {
    throw ApiError.forbidden('You do not have permission to export this report');
  }

  const payload = await reportsService.buildReport({
    report: query.report,
    from: query.from,
    to: query.to,
    month: query.month,
    year: query.year,
  });

  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: AuditAction.REPORT_EXPORT,
    entity: 'Report',
    entityId: payload.report,
    meta: getRequestMeta(req),
    newValue: redactForAudit({
      report: payload.report,
      format: query.format,
      from: payload.range?.from ?? null,
      to: payload.range?.to ?? null,
      month: payload.period?.month ?? null,
      year: payload.period?.year ?? null,
    }),
  });

  if (query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportsService.csvFilename(payload)}"`);
    res.send(reportsService.toCsv(payload));
    return;
  }

  sendSuccess(res, payload, 'Report generated');
}
