import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getBody, getParams, getQuery } from '../../utils/request';
import {
  createCandidate,
  deleteCandidate,
  downloadResume,
  getCandidate,
  listCandidates,
  updateCandidate,
  uploadResume,
} from './candidates.service';
import type { CreateCandidateBody, ListCandidatesQuery, UpdateCandidateBody } from './candidates.validator';

type Actor = { id: string; email: string; role: string; employeeId: string | null };

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

export async function listCandidatesController(req: Request, res: Response): Promise<void> {
  const result = await listCandidates(getQuery<ListCandidatesQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Candidates retrieved');
}

export async function getCandidateController(req: Request, res: Response): Promise<void> {
  const candidate = await getCandidate(getParams<{ id: string }>(req).id);
  sendSuccess(res, candidate, 'Candidate retrieved');
}

export async function createCandidateController(req: Request, res: Response): Promise<void> {
  const candidate = await createCandidate(getBody<CreateCandidateBody>(req), actorOf(req), getRequestMeta(req));
  sendCreated(res, candidate, 'Candidate created');
}

export async function updateCandidateController(req: Request, res: Response): Promise<void> {
  const candidate = await updateCandidate(
    getParams<{ id: string }>(req).id,
    getBody<UpdateCandidateBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, candidate, 'Candidate updated');
}

export async function uploadResumeController(req: Request, res: Response): Promise<void> {
  const candidate = await uploadResume(
    getParams<{ id: string }>(req).id,
    req.file,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, candidate, 'Resume uploaded');
}

export async function downloadResumeController(req: Request, res: Response): Promise<void> {
  await downloadResume(getParams<{ id: string }>(req).id, actorOf(req), getRequestMeta(req), res);
}

export async function deleteCandidateController(req: Request, res: Response): Promise<void> {
  const result = await deleteCandidate(getParams<{ id: string }>(req).id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Candidate deleted');
}
