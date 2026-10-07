import type { RequestHandler } from 'express';
import { getHealthReport } from './health.service';
import { sendSuccess } from '../../utils/apiResponse';

export const healthController: RequestHandler = (_req, res, next) => {
  getHealthReport()
    .then((report) => sendSuccess(res, report, 'Service is healthy', report.status === 'ok' ? 200 : 503))
    .catch(next);
};
