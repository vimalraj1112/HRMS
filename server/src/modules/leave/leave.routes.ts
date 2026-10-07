import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  adjustBalanceController,
  applyLeaveController,
  cancelRequestController,
  createLeaveTypeController,
  decideRequestController,
  deleteLeaveTypeController,
  employeeBalancesController,
  getRequestController,
  listApprovalsController,
  listLeaveTypesController,
  listMyRequestsController,
  listRequestsController,
  myBalancesController,
  rolloverBalancesController,
  updateLeaveTypeController,
} from './leave.controller';
import {
  adjustBalanceSchema,
  applyLeaveSchema,
  cancelLeaveSchema,
  createLeaveTypeSchema,
  decideLeaveSchema,
  leaveBalancesQuerySchema,
  leaveIdParamSchema,
  listLeaveRequestsQuerySchema,
  listLeaveTypesQuerySchema,
  rolloverBalancesQuerySchema,
  updateLeaveTypeSchema,
} from './leave.validator';

export const leaveRouter = Router();

leaveRouter.use(authenticate);

// ── Leave types ───────────────────────────────────────────────
leaveRouter.get(
  '/leave-types',
  requirePermission(PERMISSIONS.LEAVE_TYPE_READ),
  validate({ query: listLeaveTypesQuerySchema }),
  listLeaveTypesController,
);

leaveRouter.post(
  '/leave-types',
  requirePermission(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate({ body: createLeaveTypeSchema }),
  createLeaveTypeController,
);

leaveRouter.patch(
  '/leave-types/:id',
  requirePermission(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate({ params: leaveIdParamSchema, body: updateLeaveTypeSchema }),
  updateLeaveTypeController,
);

leaveRouter.delete(
  '/leave-types/:id',
  requirePermission(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate({ params: leaveIdParamSchema }),
  deleteLeaveTypeController,
);

// ── Balances ──────────────────────────────────────────────────
leaveRouter.get(
  '/leave-balances/me',
  requirePermission(PERMISSIONS.LEAVE_READ_OWN),
  validate({ query: leaveBalancesQuerySchema }),
  myBalancesController,
);

leaveRouter.get(
  '/leave-balances/:id',
  requirePermission(PERMISSIONS.LEAVE_BALANCE_MANAGE, PERMISSIONS.LEAVE_READ_ANY),
  validate({ params: leaveIdParamSchema, query: leaveBalancesQuerySchema }),
  employeeBalancesController,
);

leaveRouter.patch(
  '/leave-balances/:id',
  requirePermission(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate({ params: leaveIdParamSchema, body: adjustBalanceSchema }),
  adjustBalanceController,
);

leaveRouter.post(
  '/leave-balances/rollover',
  requirePermission(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate({ query: rolloverBalancesQuerySchema }),
  rolloverBalancesController,
);

// ── Requests ──────────────────────────────────────────────────
leaveRouter.get(
  '/leaves/my',
  requirePermission(PERMISSIONS.LEAVE_READ_OWN),
  validate({ query: listLeaveRequestsQuerySchema }),
  listMyRequestsController,
);

leaveRouter.get(
  '/leaves/approvals',
  requirePermission(PERMISSIONS.LEAVE_APPROVE_MANAGER, PERMISSIONS.LEAVE_APPROVE_HR, PERMISSIONS.LEAVE_MANAGE),
  validate({ query: listLeaveRequestsQuerySchema }),
  listApprovalsController,
);

leaveRouter.get(
  '/leaves',
  requirePermission(PERMISSIONS.LEAVE_READ_ANY, PERMISSIONS.LEAVE_READ_OWN),
  validate({ query: listLeaveRequestsQuerySchema }),
  listRequestsController,
);

leaveRouter.post(
  '/leaves',
  requirePermission(PERMISSIONS.LEAVE_APPLY),
  validate({ body: applyLeaveSchema }),
  applyLeaveController,
);

leaveRouter.get(
  '/leaves/:id',
  requirePermission(PERMISSIONS.LEAVE_READ_ANY, PERMISSIONS.LEAVE_READ_OWN),
  validate({ params: leaveIdParamSchema }),
  getRequestController,
);

leaveRouter.post(
  '/leaves/:id/decision',
  requirePermission(PERMISSIONS.LEAVE_APPROVE_MANAGER, PERMISSIONS.LEAVE_APPROVE_HR, PERMISSIONS.LEAVE_MANAGE),
  validate({ params: leaveIdParamSchema, body: decideLeaveSchema }),
  decideRequestController,
);

leaveRouter.post(
  '/leaves/:id/cancel',
  requirePermission(PERMISSIONS.LEAVE_READ_OWN, PERMISSIONS.LEAVE_MANAGE),
  validate({ params: leaveIdParamSchema, body: cancelLeaveSchema }),
  cancelRequestController,
);
