import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  acknowledgeReviewController,
  createGoalController,
  createReviewController,
  deleteGoalController,
  getGoalController,
  getReviewController,
  listGoalsController,
  listReviewsController,
  submitReviewController,
  updateGoalController,
  updateReviewController,
} from './performance.controller';
import {
  acknowledgeReviewSchema,
  createGoalSchema,
  createReviewSchema,
  listGoalsQuerySchema,
  listReviewsQuerySchema,
  performanceIdParamSchema,
  submitReviewSchema,
  updateGoalSchema,
  updateReviewSchema,
} from './performance.validator';

export const performanceRouter = Router();

performanceRouter.use(authenticate);

// ── Goals ─────────────────────────────────────────────────────
// Every role holds goal:manage:own, so the routes stay open to all authenticated
// users; the service narrows reads/writes to own goals, reports, or everybody.
performanceRouter.get(
  '/goals',
  requirePermission(PERMISSIONS.GOAL_MANAGE_OWN),
  validate({ query: listGoalsQuerySchema }),
  listGoalsController,
);

performanceRouter.post(
  '/goals',
  requirePermission(PERMISSIONS.GOAL_MANAGE_OWN),
  validate({ body: createGoalSchema }),
  createGoalController,
);

performanceRouter.get(
  '/goals/:id',
  requirePermission(PERMISSIONS.GOAL_MANAGE_OWN),
  validate({ params: performanceIdParamSchema }),
  getGoalController,
);

performanceRouter.patch(
  '/goals/:id',
  requirePermission(PERMISSIONS.GOAL_MANAGE_OWN),
  validate({ params: performanceIdParamSchema, body: updateGoalSchema }),
  updateGoalController,
);

performanceRouter.delete(
  '/goals/:id',
  requirePermission(PERMISSIONS.GOAL_MANAGE_OWN),
  validate({ params: performanceIdParamSchema }),
  deleteGoalController,
);

// ── Performance reviews ───────────────────────────────────────
performanceRouter.get(
  '/reviews',
  requirePermission(PERMISSIONS.REVIEW_READ_OWN),
  validate({ query: listReviewsQuerySchema }),
  listReviewsController,
);

performanceRouter.get(
  '/reviews/:id',
  requirePermission(PERMISSIONS.REVIEW_READ_OWN),
  validate({ params: performanceIdParamSchema }),
  getReviewController,
);

// Creation and editing are manager/HR actions: employees may read their own
// review and acknowledge it, but never author one.
performanceRouter.post(
  '/reviews',
  requirePermission(PERMISSIONS.REVIEW_MANAGE_TEAM, PERMISSIONS.REVIEW_MANAGE_ANY),
  validate({ body: createReviewSchema }),
  createReviewController,
);

performanceRouter.patch(
  '/reviews/:id',
  requirePermission(PERMISSIONS.REVIEW_MANAGE_TEAM, PERMISSIONS.REVIEW_MANAGE_ANY),
  validate({ params: performanceIdParamSchema, body: updateReviewSchema }),
  updateReviewController,
);

performanceRouter.post(
  '/reviews/:id/submit',
  requirePermission(PERMISSIONS.REVIEW_MANAGE_TEAM, PERMISSIONS.REVIEW_MANAGE_ANY),
  validate({ params: performanceIdParamSchema, body: submitReviewSchema }),
  submitReviewController,
);

performanceRouter.post(
  '/reviews/:id/acknowledge',
  requirePermission(PERMISSIONS.REVIEW_READ_OWN),
  validate({ params: performanceIdParamSchema, body: acknowledgeReviewSchema }),
  acknowledgeReviewController,
);
