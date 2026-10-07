import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getBody, getParams, getQuery } from '../../utils/request';
import { deleteJob, getJob, listJobs, createJob, updateJob } from './jobs.service';
import type { CreateJobBody, ListJobsQuery, UpdateJobBody } from './jobs.validator';

type Actor = { id: string; email: string; role: string; employeeId: string | null };

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

export async function listJobsController(req: Request, res: Response): Promise<void> {
  const result = await listJobs(getQuery<ListJobsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Job openings retrieved');
}

export async function getJobController(req: Request, res: Response): Promise<void> {
  const job = await getJob(getParams<{ id: string }>(req).id);
  sendSuccess(res, job, 'Job opening retrieved');
}

export async function createJobController(req: Request, res: Response): Promise<void> {
  const job = await createJob(getBody<CreateJobBody>(req), actorOf(req), getRequestMeta(req));
  sendCreated(res, job, 'Job opening created');
}

export async function updateJobController(req: Request, res: Response): Promise<void> {
  const job = await updateJob(getParams<{ id: string }>(req).id, getBody<UpdateJobBody>(req), actorOf(req), getRequestMeta(req));
  sendSuccess(res, job, 'Job opening updated');
}

export async function deleteJobController(req: Request, res: Response): Promise<void> {
  const result = await deleteJob(getParams<{ id: string }>(req).id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Job opening deleted');
}
