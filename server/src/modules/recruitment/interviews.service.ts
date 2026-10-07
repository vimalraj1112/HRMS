import { AuditAction, type InterviewStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { notifyRole } from '../notifications/notifications.service';
import type { Actor } from '../leave/leave.service';
import type {
  CreateInterviewBody,
  ListInterviewsQuery,
  SubmitFeedbackBody,
  UpdateInterviewBody,
} from './interviews.validator';

const INTERVIEW_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  SCHEDULED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const INTERVIEW_SORT_FIELDS = new Set(['scheduledAt', 'createdAt', 'round', 'status']);

const INTERVIEW_SELECT = {
  id: true,
  candidateId: true,
  interviewerId: true,
  round: true,
  scheduledAt: true,
  durationMinutes: true,
  mode: true,
  locationOrLink: true,
  status: true,
  rating: true,
  recommendation: true,
  strengths: true,
  improvements: true,
  feedback: true,
  feedbackAt: true,
  createdAt: true,
  updatedAt: true,
  candidate: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      jobOpening: { select: { id: true, title: true } },
    },
  },
  interviewer: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
} as const;

type InterviewRecord = Prisma.InterviewGetPayload<{ select: typeof INTERVIEW_SELECT }>;

function serializeInterview(interview: InterviewRecord) {
  return interview;
}

async function assertCandidate(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, firstName: true, lastName: true, email: true, status: true },
  });
  if (!candidate) throw ApiError.unprocessable('The selected candidate does not exist');
  return candidate;
}

async function assertInterviewer(interviewerId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: interviewerId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) throw ApiError.unprocessable('The selected interviewer does not exist');
  return employee;
}

function assertFutureDate(value: Date, message: string) {
  if (value.getTime() <= Date.now()) throw ApiError.unprocessable(message);
}

export async function listInterviews(query: ListInterviewsQuery) {
  const where: Prisma.InterviewWhereInput = {
    ...(query.candidateId ? { candidateId: query.candidateId } : {}),
    ...(query.interviewerId ? { interviewerId: query.interviewerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { candidate: { email: { contains: query.search, mode: 'insensitive' as const } } }
      : {}),
  };

  const sortField = query.sortBy && INTERVIEW_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'scheduledAt';
  const orderBy = { [sortField]: query.sortOrder } as Prisma.InterviewOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.interview.findMany({
      where,
      select: INTERVIEW_SELECT,
      orderBy: [orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.interview.count({ where }),
  ]);

  return { items: items.map(serializeInterview), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getInterview(id: string) {
  const interview = await prisma.interview.findUnique({ where: { id }, select: INTERVIEW_SELECT });
  if (!interview) throw ApiError.notFound('Interview not found');
  return serializeInterview(interview);
}

export async function createInterview(body: CreateInterviewBody, actor: Actor, meta: RequestMeta) {
  const candidate = await assertCandidate(body.candidateId);
  const interviewer = await assertInterviewer(body.interviewerId);
  const scheduledAt = new Date(body.scheduledAt);
  assertFutureDate(scheduledAt, 'The interview date must be in the future');

  const created = await prisma.interview.create({
    data: {
      candidateId: candidate.id,
      interviewerId: interviewer.id,
      round: body.round ?? 1,
      scheduledAt,
      durationMinutes: body.durationMinutes ?? 60,
      mode: body.mode ?? 'ONSITE',
      locationOrLink: body.locationOrLink ?? null,
      status: 'SCHEDULED',
    },
    select: INTERVIEW_SELECT,
  });

  // Booking an interview moves an early-stage candidate onto the interview stage.
  if (candidate.status === 'APPLIED' || candidate.status === 'SCREENING') {
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { status: 'INTERVIEW', stageOrder: 2 },
    });

    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: AuditAction.CANDIDATE_STATUS_CHANGE,
      entity: 'Candidate',
      entityId: candidate.id,
      meta,
      oldValue: { status: candidate.status },
      newValue: { status: 'INTERVIEW' },
    });
  }

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.INTERVIEW_CREATE,
    entity: 'Interview',
    entityId: created.id,
    meta,
    newValue: {
      candidateId: candidate.id,
      interviewerId: interviewer.id,
      round: created.round,
      scheduledAt: scheduledAt.toISOString(),
      mode: created.mode,
    },
  });

  await notifyRole(['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'], {
    type: 'INFO',
    title: `Interview scheduled for ${candidate.firstName} ${candidate.lastName}`,
    message: `Round ${created.round} with ${interviewer.firstName} ${interviewer.lastName} on ${scheduledAt.toISOString()}.`,
    link: '/recruitment/interviews',
    entityType: 'Interview',
    entityId: created.id,
  });

  return serializeInterview(created);
}

export async function updateInterview(id: string, body: UpdateInterviewBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.interview.findUnique({
    where: { id },
    select: { id: true, status: true, scheduledAt: true, candidateId: true, round: true },
  });
  if (!existing) throw ApiError.notFound('Interview not found');

  if (body.interviewerId) await assertInterviewer(body.interviewerId);

  let scheduledAt = existing.scheduledAt;
  if (body.scheduledAt !== undefined) {
    scheduledAt = new Date(body.scheduledAt);
    if (existing.status === 'SCHEDULED') assertFutureDate(scheduledAt, 'The interview date must be in the future');
  }

  const nextStatus = body.status;
  const statusChanged = nextStatus !== undefined && nextStatus !== existing.status;

  if (statusChanged) {
    if (!INTERVIEW_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw ApiError.conflict(`An interview in ${existing.status} status cannot move to ${nextStatus}`);
    }
  }

  const data: Prisma.InterviewUpdateInput = {};
  if (body.interviewerId !== undefined) data.interviewer = { connect: { id: body.interviewerId } };
  if (body.round !== undefined) data.round = body.round;
  if (body.scheduledAt !== undefined) data.scheduledAt = scheduledAt;
  if (body.durationMinutes !== undefined) data.durationMinutes = body.durationMinutes;
  if (body.mode !== undefined) data.mode = body.mode;
  if (body.locationOrLink !== undefined) data.locationOrLink = body.locationOrLink;
  if (statusChanged) data.status = nextStatus;

  const updated = await prisma.interview.update({ where: { id }, data, select: INTERVIEW_SELECT });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.INTERVIEW_UPDATE,
    entity: 'Interview',
    entityId: id,
    meta,
    oldValue: { status: existing.status, scheduledAt: existing.scheduledAt.toISOString() },
    newValue: { status: updated.status, scheduledAt: updated.scheduledAt.toISOString() },
  });

  return serializeInterview(updated);
}

/**
 * Hiring feedback nudges an early candidate forward; a rejection only lands when
 * this was the last interview still on the calendar, so a candidate with a
 * pending round is never auto-rejected.
 */
async function applyFeedbackToCandidate(
  interview: { id: string; candidateId: string; round: number },
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'NO_HIRE' | 'STRONG_NO_HIRE',
  actor: Actor,
  meta: RequestMeta,
): Promise<void> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: interview.candidateId },
    select: { id: true, status: true },
  });
  if (!candidate) return;

  const positive = recommendation === 'HIRE' || recommendation === 'STRONG_HIRE';
  const negative = recommendation === 'NO_HIRE' || recommendation === 'STRONG_NO_HIRE';

  if (positive && (candidate.status === 'APPLIED' || candidate.status === 'SCREENING')) {
    await prisma.candidate.update({ where: { id: candidate.id }, data: { status: 'INTERVIEW', stageOrder: 2 } });
    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: AuditAction.CANDIDATE_STATUS_CHANGE,
      entity: 'Candidate',
      entityId: candidate.id,
      meta,
      oldValue: { status: candidate.status },
      newValue: { status: 'INTERVIEW' },
    });
    return;
  }

  if (!negative || candidate.status !== 'INTERVIEW') return;

  const pendingInterviews = await prisma.interview.count({
    where: { candidateId: candidate.id, status: 'SCHEDULED', NOT: { id: interview.id } },
  });
  if (pendingInterviews > 0) return;

  await prisma.candidate.update({
    where: { id: candidate.id },
    data: { status: 'REJECTED', rejectionReason: `Interview feedback: ${recommendation}` },
  });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_STATUS_CHANGE,
    entity: 'Candidate',
    entityId: candidate.id,
    meta,
    oldValue: { status: candidate.status },
    newValue: { status: 'REJECTED', rejectionReason: `Interview feedback: ${recommendation}` },
  });
}

export async function submitInterviewFeedback(
  id: string,
  body: SubmitFeedbackBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.interview.findUnique({
    where: { id },
    select: { id: true, status: true, feedbackAt: true, candidateId: true, round: true },
  });
  if (!existing) throw ApiError.notFound('Interview not found');

  if (existing.feedbackAt) throw ApiError.conflict('Feedback has already been submitted for this interview');
  if (existing.status === 'CANCELLED' || existing.status === 'NO_SHOW') {
    throw ApiError.conflict(`Feedback cannot be submitted for an interview in ${existing.status} status`);
  }

  const updated = await prisma.interview.update({
    where: { id },
    data: {
      rating: body.rating,
      recommendation: body.recommendation,
      feedback: body.feedback ?? null,
      strengths: body.strengths ?? null,
      improvements: body.improvements ?? null,
      feedbackAt: new Date(),
      status: 'COMPLETED',
    },
    select: INTERVIEW_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.INTERVIEW_FEEDBACK,
    entity: 'Interview',
    entityId: id,
    meta,
    newValue: {
      rating: updated.rating,
      recommendation: updated.recommendation,
      status: updated.status,
      round: updated.round,
    },
  });

  await applyFeedbackToCandidate(existing, body.recommendation, actor, meta);

  return serializeInterview(updated);
}
