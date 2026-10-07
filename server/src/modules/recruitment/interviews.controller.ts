import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getBody, getParams, getQuery } from '../../utils/request';
import {
  createInterview,
  getInterview,
  listInterviews,
  submitInterviewFeedback,
  updateInterview,
} from './interviews.service';
import type {
  CreateInterviewBody,
  ListInterviewsQuery,
  SubmitFeedbackBody,
  UpdateInterviewBody,
} from './interviews.validator';

type Actor = { id: string; email: string; role: string; employeeId: string | null };

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

export async function listInterviewsController(req: Request, res: Response): Promise<void> {
  const result = await listInterviews(getQuery<ListInterviewsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Interviews retrieved');
}

export async function getInterviewController(req: Request, res: Response): Promise<void> {
  const interview = await getInterview(getParams<{ id: string }>(req).id);
  sendSuccess(res, interview, 'Interview retrieved');
}

export async function createInterviewController(req: Request, res: Response): Promise<void> {
  const interview = await createInterview(getBody<CreateInterviewBody>(req), actorOf(req), getRequestMeta(req));
  sendCreated(res, interview, 'Interview scheduled');
}

export async function updateInterviewController(req: Request, res: Response): Promise<void> {
  const interview = await updateInterview(
    getParams<{ id: string }>(req).id,
    getBody<UpdateInterviewBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, interview, 'Interview updated');
}

export async function submitInterviewFeedbackController(req: Request, res: Response): Promise<void> {
  const interview = await submitInterviewFeedback(
    getParams<{ id: string }>(req).id,
    getBody<SubmitFeedbackBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, interview, 'Interview feedback submitted');
}
