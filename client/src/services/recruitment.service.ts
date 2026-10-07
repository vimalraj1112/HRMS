import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type {
  Candidate,
  CandidateDetail,
  CandidateListQuery,
  CandidatePayload,
  CandidateUpdatePayload,
  Interview,
  InterviewFeedbackPayload,
  InterviewListQuery,
  InterviewPayload,
  InterviewUpdatePayload,
  JobListQuery,
  JobOpening,
  JobPayload,
  Offer,
  OfferListQuery,
  OfferPayload,
  OfferUpdatePayload,
} from '@/types/recruitment';
import type { Page } from './employee.service';

const RECRUITMENT_PATH = '/recruitment';

async function list<T>(path: string, query: object): Promise<Page<T>> {
  const response = await api.get<ApiSuccess<T[]>>(`${RECRUITMENT_PATH}/${path}`, { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<T>['meta'] };
}

async function read<T>(path: string): Promise<T> {
  const response = await api.get<ApiSuccess<T>>(`${RECRUITMENT_PATH}/${path}`);
  return response.data.data;
}

async function write<T>(method: 'post' | 'patch', path: string, payload: unknown): Promise<T> {
  const response = await api[method]<ApiSuccess<T>>(`${RECRUITMENT_PATH}/${path}`, payload);
  return response.data.data;
}

// ── Job openings ─────────────────────────────────────────────
export function listJobs(query: JobListQuery = {}): Promise<Page<JobOpening>> {
  return list<JobOpening>('jobs', query);
}

export function getJob(id: string): Promise<JobOpening> {
  return read<JobOpening>(`jobs/${id}`);
}

export function createJob(payload: JobPayload): Promise<JobOpening> {
  return write<JobOpening>('post', 'jobs', payload);
}

export function updateJob(id: string, payload: Partial<JobPayload>): Promise<JobOpening> {
  return write<JobOpening>('patch', `jobs/${id}`, payload);
}

export async function deleteJob(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`${RECRUITMENT_PATH}/jobs/${id}`);
  return response.data.data;
}

// ── Candidates ───────────────────────────────────────────────
export function listCandidates(query: CandidateListQuery = {}): Promise<Page<Candidate>> {
  return list<Candidate>('candidates', query);
}

export function getCandidate(id: string): Promise<CandidateDetail> {
  return read<CandidateDetail>(`candidates/${id}`);
}

export function createCandidate(payload: CandidatePayload): Promise<Candidate> {
  return write<Candidate>('post', 'candidates', payload);
}

export function updateCandidate(id: string, payload: CandidateUpdatePayload): Promise<Candidate> {
  return write<Candidate>('patch', `candidates/${id}`, payload);
}

export async function deleteCandidate(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`${RECRUITMENT_PATH}/candidates/${id}`);
  return response.data.data;
}

export async function uploadResume(id: string, file: File): Promise<Candidate> {
  const body = new FormData();
  body.append('file', file);
  const response = await api.post<ApiSuccess<Candidate>>(`${RECRUITMENT_PATH}/candidates/${id}/resume`, body, {
    // The default JSON header would stop the browser adding its boundary.
    headers: { 'Content-Type': undefined },
  });
  return response.data.data;
}

export async function downloadResume(candidate: Candidate): Promise<void> {
  const response = await api.get<Blob>(`${RECRUITMENT_PATH}/candidates/${candidate.id}/resume`, {
    responseType: 'blob',
  });

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = candidate.resumeFileName ?? 'resume';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

// ── Interviews ───────────────────────────────────────────────
export function listInterviews(query: InterviewListQuery = {}): Promise<Page<Interview>> {
  return list<Interview>('interviews', query);
}

export function getInterview(id: string): Promise<Interview> {
  return read<Interview>(`interviews/${id}`);
}

export function createInterview(payload: InterviewPayload): Promise<Interview> {
  return write<Interview>('post', 'interviews', payload);
}

export function updateInterview(id: string, payload: InterviewUpdatePayload): Promise<Interview> {
  return write<Interview>('patch', `interviews/${id}`, payload);
}

export function submitInterviewFeedback(id: string, payload: InterviewFeedbackPayload): Promise<Interview> {
  return write<Interview>('post', `interviews/${id}/feedback`, payload);
}

// ── Offers ───────────────────────────────────────────────────
export function listOffers(query: OfferListQuery = {}): Promise<Page<Offer>> {
  return list<Offer>('offers', query);
}

export function getOffer(id: string): Promise<Offer> {
  return read<Offer>(`offers/${id}`);
}

export function createOffer(payload: OfferPayload): Promise<Offer> {
  return write<Offer>('post', 'offers', payload);
}

export function updateOffer(id: string, payload: OfferUpdatePayload): Promise<Offer> {
  return write<Offer>('patch', `offers/${id}`, payload);
}

export function respondToOffer(id: string, status: 'ACCEPTED' | 'REJECTED', notes?: string): Promise<Offer> {
  return write<Offer>('post', `offers/${id}/respond`, { status, notes });
}
