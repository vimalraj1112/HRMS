import { AuditAction, type JobStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { Actor } from '../leave/leave.service';
import type { CreateJobBody, ListJobsQuery, UpdateJobBody } from './jobs.validator';

/**
 * Job lifecycle is a small state machine: drafts are published, live jobs can be
 * put on hold and resumed, and only a live or held job can be closed.
 */
const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['ON_HOLD', 'CLOSED'],
  ON_HOLD: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

const JOB_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'title', 'status', 'openingsCount']);

const JOB_SELECT = {
  id: true,
  title: true,
  departmentId: true,
  designationId: true,
  hiringManagerId: true,
  location: true,
  employmentType: true,
  openingsCount: true,
  description: true,
  requirements: true,
  minExperience: true,
  maxExperience: true,
  salaryMin: true,
  salaryMax: true,
  status: true,
  publishedAt: true,
  closedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  hiringManager: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
  createdBy: { select: { id: true, email: true } },
  _count: { select: { candidates: true } },
} as const;

type JobRecord = Prisma.JobOpeningGetPayload<{ select: typeof JOB_SELECT }>;

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value === null || value === undefined ? 0 : value.toNumber();
}

function serializeJob(job: JobRecord) {
  return {
    ...job,
    salaryMin: job.salaryMin === null ? null : toNumber(job.salaryMin),
    salaryMax: job.salaryMax === null ? null : toNumber(job.salaryMax),
  };
}

async function assertReferenceExists(table: 'department' | 'designation' | 'employee', id: string, label: string) {
  const record =
    table === 'department'
      ? await prisma.department.findUnique({ where: { id }, select: { id: true } })
      : table === 'designation'
        ? await prisma.designation.findUnique({ where: { id }, select: { id: true } })
        : await prisma.employee.findUnique({ where: { id }, select: { id: true } });

  if (!record) throw ApiError.unprocessable(`The selected ${label} does not exist`);
}

async function assertReferences(body: {
  departmentId?: string;
  designationId?: string;
  hiringManagerId?: string;
}): Promise<void> {
  if (body.departmentId) await assertReferenceExists('department', body.departmentId, 'department');
  if (body.designationId) await assertReferenceExists('designation', body.designationId, 'designation');
  if (body.hiringManagerId) await assertReferenceExists('employee', body.hiringManagerId, 'hiring manager');
}

export async function listJobs(query: ListJobsQuery) {
  const where: Prisma.JobOpeningWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };

  const sortField = query.sortBy && JOB_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
  const orderBy = { [sortField]: query.sortOrder } as Prisma.JobOpeningOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.jobOpening.findMany({
      where,
      select: JOB_SELECT,
      orderBy: [orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.jobOpening.count({ where }),
  ]);

  return { items: items.map(serializeJob), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getJob(id: string) {
  const job = await prisma.jobOpening.findUnique({ where: { id }, select: JOB_SELECT });
  if (!job) throw ApiError.notFound('Job opening not found');
  return serializeJob(job);
}

export async function createJob(body: CreateJobBody, actor: Actor, meta: RequestMeta) {
  await assertReferences(body);

  const status: JobStatus = body.status ?? 'DRAFT';
  if (status === 'OPEN' && !body.publishedAt) {
    throw ApiError.unprocessable('Set a publish date before opening a job');
  }

  const created = await prisma.jobOpening.create({
    data: {
      title: body.title,
      departmentId: body.departmentId ?? null,
      designationId: body.designationId ?? null,
      hiringManagerId: body.hiringManagerId ?? null,
      location: body.location ?? null,
      employmentType: body.employmentType ?? 'FULL_TIME',
      openingsCount: body.openingsCount ?? 1,
      description: body.description,
      requirements: body.requirements ?? null,
      minExperience: body.minExperience ?? null,
      maxExperience: body.maxExperience ?? null,
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
      status,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      closedAt: null,
      createdById: actor.id,
    },
    select: JOB_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.JOB_CREATE,
    entity: 'JobOpening',
    entityId: created.id,
    meta,
    newValue: { title: created.title, status: created.status, openingsCount: created.openingsCount },
  });

  return serializeJob(created);
}

export async function updateJob(id: string, body: UpdateJobBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.jobOpening.findUnique({ where: { id }, select: JOB_SELECT });
  if (!existing) throw ApiError.notFound('Job opening not found');

  await assertReferences(body);

  const data: Prisma.JobOpeningUpdateInput = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.departmentId !== undefined) data.department = { connect: { id: body.departmentId } };
  if (body.designationId !== undefined) data.designation = { connect: { id: body.designationId } };
  if (body.hiringManagerId !== undefined) data.hiringManager = { connect: { id: body.hiringManagerId } };
  if (body.location !== undefined) data.location = body.location;
  if (body.employmentType !== undefined) data.employmentType = body.employmentType;
  if (body.openingsCount !== undefined) data.openingsCount = body.openingsCount;
  if (body.description !== undefined) data.description = body.description;
  if (body.requirements !== undefined) data.requirements = body.requirements;
  if (body.minExperience !== undefined) data.minExperience = body.minExperience;
  if (body.maxExperience !== undefined) data.maxExperience = body.maxExperience;
  if (body.salaryMin !== undefined) data.salaryMin = body.salaryMin;
  if (body.salaryMax !== undefined) data.salaryMax = body.salaryMax;

  if (body.publishedAt !== undefined) data.publishedAt = new Date(body.publishedAt);

  if (body.status !== undefined && body.status !== existing.status) {
    if (!JOB_TRANSITIONS[existing.status].includes(body.status)) {
      throw ApiError.conflict(`A ${existing.status} job cannot move to ${body.status}`);
    }

    if (body.status === 'OPEN') {
      const publishedAt = body.publishedAt ? new Date(body.publishedAt) : existing.publishedAt;
      if (!publishedAt) throw ApiError.unprocessable('Set a publish date before opening this job');
      data.publishedAt = publishedAt;
    }

    if (body.status === 'CLOSED') data.closedAt = new Date();
    data.status = body.status;
  }

  const updated = await prisma.jobOpening.update({ where: { id }, data, select: JOB_SELECT });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.JOB_UPDATE,
    entity: 'JobOpening',
    entityId: id,
    meta,
    oldValue: { status: existing.status, title: existing.title },
    newValue: { status: updated.status, title: updated.title },
  });

  return serializeJob(updated);
}

export async function deleteJob(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.jobOpening.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, _count: { select: { candidates: true } } },
  });
  if (!existing) throw ApiError.notFound('Job opening not found');

  if (existing._count.candidates > 0) {
    throw ApiError.conflict(
      `This job has ${existing._count.candidates} candidate(s) attached and can only be closed, not deleted`,
    );
  }

  await prisma.jobOpening.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.JOB_DELETE,
    entity: 'JobOpening',
    entityId: id,
    meta,
    oldValue: { title: existing.title, status: existing.status },
  });

  return { id, title: existing.title };
}
