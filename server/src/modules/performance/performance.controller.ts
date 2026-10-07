import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { getParams, getQuery } from '../../utils/request';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import type { Actor } from '../leave/leave.service';
import * as performanceService from './performance.service';
import type {
  CreateGoalBody,
  CreateReviewBody,
  ListGoalsQuery,
  ListReviewsQuery,
  UpdateGoalBody,
  UpdateReviewBody,
} from './performance.validator';

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    employeeId: req.user.employeeId,
  };
}

export async function listGoalsController(req: Request, res: Response): Promise<void> {
  const scope = await performanceService.resolveGoalScope(req);
  const result = await performanceService.listGoals(getQuery<ListGoalsQuery>(req), scope);
  sendPaginated(res, result.items, result.meta, 'Goals retrieved');
}

export async function getGoalController(req: Request, res: Response): Promise<void> {
  const scope = await performanceService.resolveGoalScope(req);
  const goal = await performanceService.getGoal(getParams<{ id: string }>(req).id, scope);
  sendSuccess(res, goal, 'Goal retrieved');
}

export async function createGoalController(req: Request, res: Response): Promise<void> {
  const scope = await performanceService.resolveGoalScope(req);
  const goal = await performanceService.createGoal(
    req.validated?.body as CreateGoalBody,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendCreated(res, goal, 'Goal created');
}

export async function updateGoalController(req: Request, res: Response): Promise<void> {
  const scope = await performanceService.resolveGoalScope(req);
  const goal = await performanceService.updateGoal(
    getParams<{ id: string }>(req).id,
    req.validated?.body as UpdateGoalBody,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendSuccess(res, goal, 'Goal updated');
}

export async function deleteGoalController(req: Request, res: Response): Promise<void> {
  const scope = await performanceService.resolveGoalScope(req);
  const result = await performanceService.deleteGoal(
    getParams<{ id: string }>(req).id,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendSuccess(res, result, 'Goal deleted');
}

export async function listReviewsController(req: Request, res: Response): Promise<void> {
  const result = await performanceService.listReviews(getQuery<ListReviewsQuery>(req), actorOf(req));
  sendPaginated(res, result.items, result.meta, 'Performance reviews retrieved');
}

export async function getReviewController(req: Request, res: Response): Promise<void> {
  const review = await performanceService.getReview(getParams<{ id: string }>(req).id, actorOf(req));
  sendSuccess(res, review, 'Performance review retrieved');
}

export async function createReviewController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const review = await performanceService.createReview(
    req.validated?.body as CreateReviewBody,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendCreated(res, review, 'Performance review created');
}

export async function updateReviewController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const review = await performanceService.updateReview(
    getParams<{ id: string }>(req).id,
    req.validated?.body as UpdateReviewBody,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendSuccess(res, review, 'Performance review updated');
}

export async function submitReviewController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const review = await performanceService.submitReview(
    getParams<{ id: string }>(req).id,
    (req.validated?.body ?? {}),
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendSuccess(res, review, 'Performance review submitted');
}

export async function acknowledgeReviewController(req: Request, res: Response): Promise<void> {
  const review = await performanceService.acknowledgeReview(
    getParams<{ id: string }>(req).id,
    (req.validated?.body ?? {}),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, review, 'Performance review acknowledged');
}
