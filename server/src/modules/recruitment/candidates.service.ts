import { AuditAction, type CandidateStatus, type Prisma } from '@prisma/client';
import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { storage } from '../../services/storage.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { Actor } from '../leave/leave.service';
import type { CreateCandidateBody, ListCandidatesQuery, UpdateCandidateBody } from './candidates.validator';

/** Candidate pipeline order used for board style listings. */
const PIPELINE_ORDER: CandidateStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'OFFERED', 'HIRED'];

const CANDIDATE_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  APPLIED: ['SCREENING', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'WITHDRAWN'],
  INTERVIEW: ['SELECTED', 'REJECTED', 'OFFERED', 'WITHDRAWN'],
  SELECTED: ['HIRED', 'WITHDRAWN'],
  OFFERED: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  HIRED: [],
  WITHDRAWN: [],
};

const CANDIDATE_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'firstName', 'lastName', 'status']);

const RESUME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

const CANDIDATE_SELECT = {
  id: true,
  jobOpeningId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  currentCompany: true,
  currentDesignation: true,
  experienceYears: true,
  expectedSalary: true,
  resumeKey: true,
  resumeFileName: true,
  source: true,
  status: true,
  stageOrder: true,
  notes: true,
  rejectionReason: true,
  hiredEmployeeId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  jobOpening: { select: { id: true, title: true, status: true, departmentId: true } },
  hiredEmployee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, email: true } },
  _count: { select: { interviews: true, offers: true } },
} as const;

type CandidateRecord = Prisma.CandidateGetPayload<{ select: typeof CANDIDATE_SELECT }>;

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

function serializeCandidate(candidate: CandidateRecord) {
  const { resumeKey, ...rest } = candidate;
  return {
    ...rest,
    experienceYears: toNumber(candidate.experienceYears),
    expectedSalary: toNumber(candidate.expectedSalary),
    hasResume: Boolean(resumeKey) && resumeKey !== 'pending',
  };
}

async function assertJobOpening(jobOpeningId: string | undefined): Promise<void> {
  if (!jobOpeningId) return;
  const job = await prisma.jobOpening.findUnique({ where: { id: jobOpeningId }, select: { id: true } });
  if (!job) throw ApiError.unprocessable('The selected job opening does not exist');
}

async function assertEmployee(employeeId: string, label: string): Promise<void> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) throw ApiError.unprocessable(`The selected ${label} does not exist`);
}

export async function listCandidates(query: ListCandidatesQuery) {
  const where: Prisma.CandidateWhereInput = {
    ...(query.jobOpeningId ? { jobOpeningId: query.jobOpeningId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const sortField = query.sortBy && CANDIDATE_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
  const orderBy = { [sortField]: query.sortOrder } as Prisma.CandidateOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      select: CANDIDATE_SELECT,
      orderBy: [orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.candidate.count({ where }),
  ]);

  return { items: items.map(serializeCandidate), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getCandidate(id: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: {
      ...CANDIDATE_SELECT,
      interviews: {
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          round: true,
          scheduledAt: true,
          durationMinutes: true,
          mode: true,
          status: true,
          rating: true,
          recommendation: true,
          interviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      offers: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          annualCtc: true,
          status: true,
          joiningDate: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const { interviews, offers, ...rest } = candidate;
  return {
    ...serializeCandidate(rest),
    interviews,
    offers: offers.map((offer) => ({ ...offer, annualCtc: offer.annualCtc.toNumber() })),
  };
}

export async function createCandidate(body: CreateCandidateBody, actor: Actor, meta: RequestMeta) {
  const email = body.email.toLowerCase();

  const duplicate = await prisma.candidate.findUnique({ where: { email }, select: { id: true } });
  if (duplicate) throw ApiError.conflict('A candidate with this email address already exists');

  await assertJobOpening(body.jobOpeningId);

  const created = await prisma.candidate.create({
    data: {
      jobOpeningId: body.jobOpeningId ?? null,
      firstName: body.firstName,
      lastName: body.lastName,
      email,
      phone: body.phone ?? null,
      currentCompany: body.currentCompany ?? null,
      currentDesignation: body.currentDesignation ?? null,
      experienceYears: body.experienceYears ?? null,
      expectedSalary: body.expectedSalary ?? null,
      source: body.source ?? null,
      notes: body.notes ?? null,
      status: body.status ?? 'APPLIED',
      stageOrder: 0,
      createdById: actor.id,
    },
    select: CANDIDATE_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_CREATE,
    entity: 'Candidate',
    entityId: created.id,
    meta,
    newValue: { email: created.email, status: created.status, jobOpeningId: created.jobOpeningId },
  });

  return serializeCandidate(created);
}

export async function updateCandidate(id: string, body: UpdateCandidateBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, email: true, status: true, stageOrder: true, resumeKey: true, rejectionReason: true },
  });
  if (!existing) throw ApiError.notFound('Candidate not found');

  await assertJobOpening(body.jobOpeningId);

  if (body.employeeId) await assertEmployee(body.employeeId, 'employee');

  if (body.email !== undefined) {
    const normalized = body.email.toLowerCase();
    if (normalized !== existing.email) {
      const duplicate = await prisma.candidate.findFirst({
        where: { email: normalized, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw ApiError.conflict('A candidate with this email address already exists');
    }
  }

  const nextStatus = body.status;
  const statusChanged = nextStatus !== undefined && nextStatus !== existing.status;

  if (statusChanged) {
    if (!CANDIDATE_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw ApiError.conflict(`A candidate in ${existing.status} status cannot move to ${nextStatus}`);
    }

    if (nextStatus === 'REJECTED' && !body.rejectionReason && !existing.rejectionReason) {
      throw ApiError.unprocessable('A rejection reason is required when rejecting a candidate');
    }

    if (nextStatus === 'HIRED') {
      if (!body.employeeId) throw ApiError.unprocessable('Link an employee record before marking the candidate as hired');
      const employee = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { id: true } });
      if (!employee) throw ApiError.unprocessable('The selected employee does not exist');
    }
  }

  const data: Prisma.CandidateUpdateInput = {};
  if (body.firstName !== undefined) data.firstName = body.firstName;
  if (body.lastName !== undefined) data.lastName = body.lastName;
  if (body.email !== undefined) data.email = body.email.toLowerCase();
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.jobOpeningId !== undefined) data.jobOpening = { connect: { id: body.jobOpeningId } };
  if (body.currentCompany !== undefined) data.currentCompany = body.currentCompany;
  if (body.currentDesignation !== undefined) data.currentDesignation = body.currentDesignation;
  if (body.experienceYears !== undefined) data.experienceYears = body.experienceYears;
  if (body.expectedSalary !== undefined) data.expectedSalary = body.expectedSalary;
  if (body.source !== undefined) data.source = body.source;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.rejectionReason !== undefined) data.rejectionReason = body.rejectionReason;
  if (body.employeeId !== undefined) data.hiredEmployee = { connect: { id: body.employeeId } };

  if (statusChanged) {
    data.status = nextStatus;
    const stage = PIPELINE_ORDER.indexOf(nextStatus);
    // Terminal rejections keep the stage they reached, so the board still shows progress.
    if (stage >= 0) data.stageOrder = stage;
    if (nextStatus === 'REJECTED' && body.rejectionReason) data.rejectionReason = body.rejectionReason;
  }

  const updated = await prisma.candidate.update({ where: { id }, data, select: CANDIDATE_SELECT });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: statusChanged ? AuditAction.CANDIDATE_STATUS_CHANGE : AuditAction.CANDIDATE_UPDATE,
    entity: 'Candidate',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: updated.status, email: updated.email },
  });

  return serializeCandidate(updated);
}

export async function uploadResume(id: string, file: Express.Multer.File | undefined, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeKey: true, resumeFileName: true },
  });
  if (!existing) throw ApiError.notFound('Candidate not found');
  if (!file) throw ApiError.badRequest('Attach a resume file to upload');

  const mimeType = file.mimetype.toLowerCase();
  const extension = RESUME_EXTENSIONS[mimeType] ?? '.bin';
  const storageKey = `candidates/${id}/${id}${extension}`;
  const fileName = file.originalname.slice(0, 255) || `resume${extension}`;

  await storage().put({ key: storageKey, body: file.buffer });

  const updated = await prisma.candidate.update({
    where: { id },
    data: { resumeKey: storageKey, resumeFileName: fileName },
    select: CANDIDATE_SELECT,
  });

  // Replacing a resume must not leave the previous file behind.
  if (existing.resumeKey && existing.resumeKey !== 'pending' && existing.resumeKey !== storageKey) {
    await storage()
      .remove(existing.resumeKey)
      .catch(() => undefined);
  }

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_UPDATE,
    entity: 'Candidate',
    entityId: id,
    meta,
    oldValue: { resumeFileName: existing.resumeFileName },
    newValue: { resumeFileName: fileName, mimeType, sizeBytes: file.size },
  });

  return serializeCandidate(updated);
}

const CONTENT_TYPES_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export async function downloadResume(id: string, actor: Actor, meta: RequestMeta, res: Response): Promise<void> {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, resumeKey: true, resumeFileName: true },
  });
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.resumeKey || candidate.resumeKey === 'pending') throw ApiError.notFound('No resume on file');

  const stream = await storage().readStream(candidate.resumeKey);
  const extension = candidate.resumeKey.slice(candidate.resumeKey.lastIndexOf('.')).toLowerCase();

  res.setHeader('Content-Type', CONTENT_TYPES_BY_EXT[extension] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${candidate.resumeFileName ?? 'resume'}"`);
  stream.pipe(res);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_UPDATE,
    entity: 'Candidate',
    entityId: id,
    meta,
    newValue: { download: 'resume', resumeFileName: candidate.resumeFileName },
  });
}

export async function deleteCandidate(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, email: true, status: true, resumeKey: true },
  });
  if (!existing) throw ApiError.notFound('Candidate not found');

  // Interviews cascade with the candidate, offers are detached by the database.
  await prisma.candidate.delete({ where: { id } });

  if (existing.resumeKey && existing.resumeKey !== 'pending') {
    await storage()
      .remove(existing.resumeKey)
      .catch(() => undefined);
  }

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    // The audit vocabulary has no dedicated candidate delete action.
    action: AuditAction.CANDIDATE_UPDATE,
    entity: 'Candidate',
    entityId: id,
    meta,
    oldValue: { email: existing.email, status: existing.status, deleted: true },
  });

  return { id, email: existing.email };
}
