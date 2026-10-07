import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { getAuditLogController, listAuditLogsController } from './audit.controller';
import { auditIdParamSchema, listAuditLogsQuerySchema } from './audit.validator';

export const auditRouter = Router();

auditRouter.use(authenticate);

auditRouter.get(
  '/',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({ query: listAuditLogsQuerySchema }),
  listAuditLogsController,
);

auditRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({ params: auditIdParamSchema }),
  getAuditLogController,
);