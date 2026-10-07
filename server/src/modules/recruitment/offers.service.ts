import { AuditAction, type OfferStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { Actor } from '../leave/leave.service';
import { notifyUser } from '../notifications/notifications.service';
import type { CreateOfferBody, ListOffersQuery, RespondToOfferBody, UpdateOfferBody } from './offers.validator';

const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: ['EXTENDED', 'WITHDRAWN'],
  EXTENDED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

/** Candidates the pipeline has already qualified can be moved onto the offer stage. */
const OFFERABLE_CANDIDATE_STATUSES = ['INTERVIEW', 'SELECTED'] as const;

const OFFER_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'status', 'annualCtc', 'joiningDate']);

const OFFER_SELECT = {
  id: true,
  candidateId: true,
  jobOpeningId: true,
  employeeId: true,
  departmentId: true,
  designationId: true,
  annualCtc: true,
  joiningDate: true,
  status: true,
  issuedAt: true,
  respondedAt: true,
  expiresAt: true,
  documentKey: true,
  notes: true,
  createdById: true,
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
  jobOpening: { select: { id: true, title: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true } },
} as const;

type OfferRecord = Prisma.OfferGetPayload<{ select: typeof OFFER_SELECT }>;

function serializeOffer(offer: OfferRecord) {
  return { ...offer, annualCtc: offer.annualCtc.toNumber() };
}

async function assertReference(table: 'department' | 'designation' | 'employee' | 'jobOpening', id: string, label: string) {
  const record =
    table === 'department'
      ? await prisma.department.findUnique({ where: { id }, select: { id: true } })
      : table === 'designation'
        ? await prisma.designation.findUnique({ where: { id }, select: { id: true } })
        : table === 'employee'
          ? await prisma.employee.findUnique({ where: { id }, select: { id: true } })
          : await prisma.jobOpening.findUnique({ where: { id }, select: { id: true } });

  if (!record) throw ApiError.unprocessable(`The selected ${label} does not exist`);
}

async function assertReferences(body: {
  candidateId?: string;
  jobOpeningId?: string;
  employeeId?: string;
  departmentId?: string;
  designationId?: string;
}) {
  if (body.candidateId) {
    const candidate = await prisma.candidate.findUnique({ where: { id: body.candidateId }, select: { id: true } });
    if (!candidate) throw ApiError.unprocessable('The selected candidate does not exist');
  }
  if (body.jobOpeningId) await assertReference('jobOpening', body.jobOpeningId, 'job opening');
  if (body.employeeId) await assertReference('employee', body.employeeId, 'employee');
  if (body.departmentId) await assertReference('department', body.departmentId, 'department');
  if (body.designationId) await assertReference('designation', body.designationId, 'designation');
}

async function notifyOfferOwner(candidateId: string, title: string, message: string, offerId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { createdById: true },
  });
  if (!candidate?.createdById) return;

  await notifyUser({
    userId: candidate.createdById,
    type: 'INFO',
    title,
    message,
    link: '/recruitment/offers',
    entityType: 'Offer',
    entityId: offerId,
  });
}

export async function listOffers(query: ListOffersQuery) {
  const where: Prisma.OfferWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.candidateId ? { candidateId: query.candidateId } : {}),
    ...(query.search
      ? {
          candidate: {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };

  const sortField = query.sortBy && OFFER_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
  const orderBy = { [sortField]: query.sortOrder } as Prisma.OfferOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      select: OFFER_SELECT,
      orderBy: [orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.offer.count({ where }),
  ]);

  return { items: items.map(serializeOffer), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getOffer(id: string) {
  const offer = await prisma.offer.findUnique({ where: { id }, select: OFFER_SELECT });
  if (!offer) throw ApiError.notFound('Offer not found');
  return serializeOffer(offer);
}

export async function createOffer(body: CreateOfferBody, actor: Actor, meta: RequestMeta) {
  await assertReferences(body);

  const openOffer = await prisma.offer.findFirst({
    where: { candidateId: body.candidateId, status: { in: ['DRAFT', 'EXTENDED'] } },
    select: { id: true },
  });
  if (openOffer) throw ApiError.conflict('This candidate already has an open offer');

  const status: OfferStatus = body.status ?? 'DRAFT';
  if (status === 'EXTENDED' && !body.expiresAt) {
    throw ApiError.unprocessable('Set an expiry date before extending this offer');
  }
  const now = new Date();

  const created = await prisma.offer.create({
    data: {
      candidateId: body.candidateId,
      jobOpeningId: body.jobOpeningId ?? null,
      employeeId: body.employeeId ?? null,
      departmentId: body.departmentId ?? null,
      designationId: body.designationId ?? null,
      annualCtc: body.annualCtc,
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      notes: body.notes ?? null,
      status,
      issuedAt: status === 'EXTENDED' ? now : null,
      createdById: actor.id,
    },
    select: OFFER_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.OFFER_CREATE,
    entity: 'Offer',
    entityId: created.id,
    meta,
    newValue: {
      candidateId: created.candidateId,
      annualCtc: created.annualCtc.toNumber(),
      status: created.status,
    },
  });

  if (status === 'EXTENDED') {
    await syncCandidateOnExtend(created.candidateId, actor, meta);
    await notifyOfferOwner(
      created.candidateId,
      'Offer extended',
      `An offer has been extended to ${created.candidate.firstName} ${created.candidate.lastName}.`,
      created.id,
    );
  }

  return serializeOffer(created);
}

/** Moves a qualified candidate onto the offer stage when an offer goes out. */
async function syncCandidateOnExtend(candidateId: string, actor: Actor, meta: RequestMeta) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, status: true },
  });
  if (!candidate) return;
  if (candidate.status === 'HIRED' || candidate.status === 'WITHDRAWN') return;
  if (!(OFFERABLE_CANDIDATE_STATUSES as readonly string[]).includes(candidate.status)) return;

  await prisma.candidate.update({ where: { id: candidateId }, data: { status: 'OFFERED', stageOrder: 4 } });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_STATUS_CHANGE,
    entity: 'Candidate',
    entityId: candidateId,
    meta,
    oldValue: { status: candidate.status },
    newValue: { status: 'OFFERED' },
  });
}

export async function updateOffer(id: string, body: UpdateOfferBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.offer.findUnique({
    where: { id },
    select: { id: true, status: true, expiresAt: true, annualCtc: true, notes: true },
  });
  if (!existing) throw ApiError.notFound('Offer not found');

  await assertReferences(body);

  if (body.status === 'ACCEPTED' || body.status === 'REJECTED') {
    throw ApiError.conflict('Use the respond endpoint to accept or reject an offer');
  }

  const nextStatus = body.status;
  const statusChanged = nextStatus !== undefined && nextStatus !== existing.status;

  if (statusChanged) {
    if (!OFFER_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw ApiError.conflict(`An offer in ${existing.status} status cannot move to ${nextStatus}`);
    }

    if (nextStatus === 'EXTENDED' && existing.status === 'DRAFT') {
      // A draft can only be extended once its expiry is known.
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : existing.expiresAt;
      if (!expiresAt) throw ApiError.unprocessable('Set an expiry date before extending this offer');
    }

    if (nextStatus === 'EXPIRED') {
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : existing.expiresAt;
      if (!expiresAt || expiresAt.getTime() > Date.now()) {
        throw ApiError.conflict('Only an offer past its expiry date can be marked as expired');
      }
    }
  }

  const data: Prisma.OfferUpdateInput = {};
  if (body.candidateId !== undefined) data.candidate = { connect: { id: body.candidateId } };
  if (body.jobOpeningId !== undefined) data.jobOpening = { connect: { id: body.jobOpeningId } };
  if (body.employeeId !== undefined) data.employee = { connect: { id: body.employeeId } };
  if (body.departmentId !== undefined) data.department = { connect: { id: body.departmentId } };
  if (body.designationId !== undefined) data.designation = { connect: { id: body.designationId } };
  if (body.annualCtc !== undefined) data.annualCtc = body.annualCtc;
  if (body.joiningDate !== undefined) data.joiningDate = new Date(body.joiningDate);
  if (body.expiresAt !== undefined) data.expiresAt = new Date(body.expiresAt);
  if (body.notes !== undefined) data.notes = body.notes;

  if (statusChanged) {
    data.status = nextStatus;
    if (nextStatus === 'EXTENDED') data.issuedAt = new Date();
  }

  const updated = await prisma.offer.update({ where: { id }, data, select: OFFER_SELECT });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: statusChanged ? AuditAction.OFFER_STATUS_CHANGE : AuditAction.OFFER_UPDATE,
    entity: 'Offer',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: updated.status, annualCtc: updated.annualCtc.toNumber() },
  });

  if (statusChanged && nextStatus === 'EXTENDED') {
    await syncCandidateOnExtend(updated.candidateId, actor, meta);
    await notifyOfferOwner(
      updated.candidateId,
      'Offer extended',
      `An offer has been extended to ${updated.candidate.firstName} ${updated.candidate.lastName}.`,
      updated.id,
    );
  }

  return serializeOffer(updated);
}

export async function respondToOffer(id: string, body: RespondToOfferBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.offer.findUnique({
    where: { id },
    select: { id: true, status: true, notes: true, candidateId: true },
  });
  if (!existing) throw ApiError.notFound('Offer not found');
  if (existing.status !== 'EXTENDED') {
    throw ApiError.conflict(`Only an extended offer can be responded to (current status: ${existing.status})`);
  }

  const now = new Date();
  const updated = await prisma.offer.update({
    where: { id },
    data: {
      status: body.status,
      respondedAt: now,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
    select: OFFER_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.OFFER_STATUS_CHANGE,
    entity: 'Offer',
    entityId: id,
    meta,
    oldValue: { status: existing.status },
    newValue: { status: updated.status, respondedAt: now.toISOString() },
  });

  const candidateOutcome = await syncCandidateOnResponse(existing.candidateId, body.status, actor, meta);

  await notifyOfferOwner(
    existing.candidateId,
    `Offer ${body.status.toLowerCase()}`,
    `The offer for ${updated.candidate.firstName} ${updated.candidate.lastName} was ${body.status.toLowerCase()}.`,
    id,
  );

  return { ...serializeOffer(updated), candidateOutcome };
}

/**
 * An accepted offer closes the pipeline for the candidate; a rejected one only
 * rejects the candidate while the offer stage is still open, so earlier stage
 * candidates are never rejected by an offer they never received.
 */
async function syncCandidateOnResponse(
  candidateId: string,
  response: 'ACCEPTED' | 'REJECTED',
  actor: Actor,
  meta: RequestMeta,
): Promise<string | null> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, status: true },
  });
  if (!candidate) return null;
  if (candidate.status === 'HIRED' || candidate.status === 'WITHDRAWN') return null;

  const nextStatus: 'HIRED' | 'OFFERED' | 'REJECTED' | null =
    response === 'ACCEPTED'
      ? candidate.status === 'SELECTED' || candidate.status === 'OFFERED'
        ? 'HIRED'
        : 'OFFERED'
      : candidate.status === 'OFFERED'
        ? 'REJECTED'
        : null;

  if (!nextStatus || nextStatus === candidate.status) return null;

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      status: nextStatus,
      ...(nextStatus === 'REJECTED' ? { rejectionReason: 'Offer rejected by candidate' } : {}),
    },
  });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.CANDIDATE_STATUS_CHANGE,
    entity: 'Candidate',
    entityId: candidateId,
    meta,
    oldValue: { status: candidate.status },
    newValue: { status: nextStatus },
  });

  return nextStatus;
}
