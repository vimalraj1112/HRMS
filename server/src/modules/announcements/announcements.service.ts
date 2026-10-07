import { AuditAction, type AnnouncementAudience, type Prisma, type Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { notifyRole, notifyUser } from '../notifications/notifications.service';
import type { Actor } from '../leave/leave.service';
import type {
  CreateAnnouncementBody,
  ListAnnouncementsQuery,
  UpdateAnnouncementBody,
} from './announcements.validator';

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  content: true,
  audience: true,
  departmentId: true,
  designationId: true,
  role: true,
  employeeId: true,
  isPinned: true,
  publishedAt: true,
  expiresAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  createdBy: { select: { email: true } },
} as const;

/** Everything the visibility rules need to know about the caller. */
export interface Viewer {
  userId: string;
  role: string;
  employeeId: string | null;
  departmentId: string | null;
  designationId: string | null;
}

function withReadFlag<T extends { id: string }>(announcement: T, readAt: Date | null | undefined) {
  return { ...announcement, isRead: Boolean(readAt), readAt: readAt ?? null };
}

/**
 * An announcement is visible when it is already published, has not expired and
 * its audience matches the caller. A bare `YYYY-MM-DD` expiresAt is read as the
 * end of that day, so "expires today" stays visible until midnight.
 */
function visibleWhere(viewer: Viewer, now = new Date()): Prisma.AnnouncementWhereInput {
  const audienceMatches: Prisma.AnnouncementWhereInput[] = [
    { audience: 'ALL' },
    { audience: 'ROLE', role: viewer.role as Role },
  ];

  if (viewer.departmentId) {
    audienceMatches.push({ audience: 'DEPARTMENT', departmentId: viewer.departmentId });
  }
  if (viewer.designationId) {
    audienceMatches.push({ audience: 'DESIGNATION', designationId: viewer.designationId });
  }
  if (viewer.employeeId) {
    audienceMatches.push({ audience: 'EMPLOYEE', employeeId: viewer.employeeId });
  }

  return {
    publishedAt: { lte: now },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: audienceMatches }],
  };
}

function parseTimestamp(value: string | null | undefined, endOfDay: boolean): Date | null {
  if (value === undefined || value === null || value === '') return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const candidate = dateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.unprocessable('Timestamp must be a valid ISO date', [
      { field: 'publishedAt', message: 'Not a valid date' },
    ]);
  }
  return date;
}

/** The audience must carry the matching target, otherwise nobody would see it. */
function assertAudienceTarget(
  audience: AnnouncementAudience,
  departmentId: string | null | undefined,
  designationId: string | null | undefined,
  role: Role | null | undefined,
  employeeId: string | null | undefined,
): void {
  const missing = (field: string, message: string) => {
    throw ApiError.unprocessable(message, [{ field, message }]);
  };

  switch (audience) {
    case 'DEPARTMENT':
      if (!departmentId) missing('departmentId', 'departmentId is required when audience is DEPARTMENT');
      break;
    case 'DESIGNATION':
      if (!designationId) missing('designationId', 'designationId is required when audience is DESIGNATION');
      break;
    case 'ROLE':
      if (!role) missing('role', 'role is required when audience is ROLE');
      break;
    case 'EMPLOYEE':
      if (!employeeId) missing('employeeId', 'employeeId is required when audience is EMPLOYEE');
      break;
    default:
      break;
  }
}

async function assertTargetsExist(
  audience: AnnouncementAudience,
  target: { departmentId?: string | null; designationId?: string | null; employeeId?: string | null },
): Promise<void> {
  if (audience === 'DEPARTMENT' && target.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: target.departmentId }, select: { id: true } });
    if (!department) throw ApiError.unprocessable('Department not found', [{ field: 'departmentId', message: 'Unknown department' }]);
  }
  if (audience === 'DESIGNATION' && target.designationId) {
    const designation = await prisma.designation.findUnique({ where: { id: target.designationId }, select: { id: true } });
    if (!designation) {
      throw ApiError.unprocessable('Designation not found', [{ field: 'designationId', message: 'Unknown designation' }]);
    }
  }
  if (audience === 'EMPLOYEE' && target.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: target.employeeId }, select: { id: true } });
    if (!employee) throw ApiError.unprocessable('Employee not found', [{ field: 'employeeId', message: 'Unknown employee' }]);
  }
}

function assertPublicationWindow(publishedAt: Date, expiresAt: Date | null): void {
  if (expiresAt && expiresAt.getTime() <= publishedAt.getTime()) {
    throw ApiError.unprocessable('expiresAt must be after publishedAt', [
      { field: 'expiresAt', message: 'Expiry must be after the publication time' },
    ]);
  }
}

function announcementOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
): Prisma.AnnouncementOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'title':
      return [{ isPinned: 'desc' }, { title: sortOrder }];
    case 'createdAt':
      return [{ isPinned: 'desc' }, { createdAt: sortOrder }];
    case 'expiresAt':
      return [{ isPinned: 'desc' }, { expiresAt: sortOrder }];
    default:
      return [{ isPinned: 'desc' }, { publishedAt: sortOrder }];
  }
}

/**
 * Notification fan-out stays deliberately small: ROLE audiences reuse
 * `notifyRole`, everything else selects at most 200 matching active accounts.
 * The send is fire-and-forget so a slow fan-out never delays the response.
 */
async function notifyAudience(
  announcement: { id: string; title: string; audience: AnnouncementAudience; role: Role | null; departmentId: string | null; designationId: string | null; employeeId: string | null },
  viewer: Viewer,
): Promise<void> {
  try {
    const input = {
      type: 'INFO' as const,
      title: `Announcement: ${announcement.title}`,
      message: 'A new announcement has been published.',
      link: '/announcements',
      entityType: 'Announcement',
      entityId: announcement.id,
    };

    if (announcement.audience === 'ROLE' && announcement.role) {
      await notifyRole([announcement.role], input);
      return;
    }

    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      id: { not: viewer.userId },
      ...(announcement.audience === 'DEPARTMENT' ? { employee: { departmentId: announcement.departmentId } } : {}),
      ...(announcement.audience === 'DESIGNATION' ? { employee: { designationId: announcement.designationId } } : {}),
      ...(announcement.audience === 'EMPLOYEE' ? { employeeId: announcement.employeeId } : {}),
    };

    const users = await prisma.user.findMany({ where, take: 200, select: { id: true } });
    await Promise.all(users.map((user) => notifyUser({ ...input, userId: user.id })));
  } catch (error) {
    logger.error({ err: error, announcementId: announcement.id }, 'Failed to fan out announcement');
  }
}

export async function listAnnouncements(viewer: Viewer, query: ListAnnouncementsQuery) {
  const where: Prisma.AnnouncementWhereInput = {
    AND: [
      visibleWhere(viewer),
      ...(query.audience ? [{ audience: query.audience }] : []),
      ...(query.pinnedOnly ? [{ isPinned: true }] : []),
      ...(query.search
        ? [
            {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { content: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      select: ANNOUNCEMENT_SELECT,
      orderBy: announcementOrderBy(query.sortBy, query.sortOrder),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.announcement.count({ where }),
  ]);

  const reads = items.length
    ? await prisma.announcementRead.findMany({
        where: { announcementId: { in: items.map((item) => item.id) }, userId: viewer.userId },
        select: { announcementId: true, readAt: true },
      })
    : [];
  const readAtById = new Map(reads.map((read) => [read.announcementId, read.readAt]));

  return {
    items: items.map((item) => withReadFlag(item, readAtById.get(item.id))),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getAnnouncement(id: string, viewer: Viewer) {
  const announcement = await prisma.announcement.findFirst({
    where: { id, AND: [visibleWhere(viewer)] },
    select: ANNOUNCEMENT_SELECT,
  });
  // Invisible announcements answer 404 so their existence never leaks.
  if (!announcement) throw ApiError.notFound('Announcement not found');

  const read = await prisma.announcementRead.findUnique({
    where: { announcementId_userId: { announcementId: id, userId: viewer.userId } },
    select: { readAt: true },
  });

  return withReadFlag(announcement, read?.readAt);
}

export async function createAnnouncement(body: CreateAnnouncementBody, viewer: Viewer, actor: Actor, meta: RequestMeta) {
  const audience = body.audience;
  assertAudienceTarget(audience, body.departmentId, body.designationId, body.role, body.employeeId);
  await assertTargetsExist(audience, {
    departmentId: body.departmentId,
    designationId: body.designationId,
    employeeId: body.employeeId,
  });

  const publishedAt = parseTimestamp(body.publishedAt, false) ?? new Date();
  const expiresAt = parseTimestamp(body.expiresAt, true);
  assertPublicationWindow(publishedAt, expiresAt);

  const announcement = await prisma.announcement.create({
    data: {
      title: body.title,
      content: body.content,
      audience,
      departmentId: body.departmentId ?? null,
      designationId: body.designationId ?? null,
      role: body.role ?? null,
      employeeId: body.employeeId ?? null,
      isPinned: body.isPinned,
      publishedAt,
      expiresAt,
      createdById: actor.id,
    },
    select: ANNOUNCEMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ANNOUNCEMENT_CREATE,
    entity: 'Announcement',
    entityId: announcement.id,
    meta,
    newValue: {
      title: announcement.title,
      audience: announcement.audience,
      isPinned: announcement.isPinned,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
    },
  });

  void notifyAudience(announcement, viewer);

  return announcement;
}

export async function updateAnnouncement(id: string, body: UpdateAnnouncementBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      audience: true,
      departmentId: true,
      designationId: true,
      role: true,
      employeeId: true,
      isPinned: true,
      publishedAt: true,
      expiresAt: true,
    },
  });
  if (!existing) throw ApiError.notFound('Announcement not found');

  // Merge first so an untouched audience keeps the target it already carries.
  const merged = {
    title: body.title ?? existing.title,
    content: body.content ?? existing.content,
    audience: body.audience ?? existing.audience,
    departmentId: body.departmentId !== undefined ? body.departmentId : existing.departmentId,
    designationId: body.designationId !== undefined ? body.designationId : existing.designationId,
    role: body.role !== undefined ? body.role : existing.role,
    employeeId: body.employeeId !== undefined ? body.employeeId : existing.employeeId,
    isPinned: body.isPinned ?? existing.isPinned,
    // Clearing publishedAt is not allowed; a blank value simply keeps the stamp.
    publishedAt:
      body.publishedAt !== undefined ? (parseTimestamp(body.publishedAt, false) ?? existing.publishedAt) : existing.publishedAt,
    expiresAt: body.expiresAt !== undefined ? parseTimestamp(body.expiresAt, true) : existing.expiresAt,
  };

  assertAudienceTarget(merged.audience, merged.departmentId, merged.designationId, merged.role, merged.employeeId);
  await assertTargetsExist(merged.audience, merged);
  assertPublicationWindow(merged.publishedAt, merged.expiresAt);

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      title: merged.title,
      content: merged.content,
      audience: merged.audience,
      departmentId: merged.departmentId,
      designationId: merged.designationId,
      role: merged.role,
      employeeId: merged.employeeId,
      isPinned: merged.isPinned,
      publishedAt: merged.publishedAt,
      expiresAt: merged.expiresAt,
    },
    select: ANNOUNCEMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ANNOUNCEMENT_UPDATE,
    entity: 'Announcement',
    entityId: id,
    meta,
    oldValue: { title: existing.title, audience: existing.audience, isPinned: existing.isPinned },
    newValue: { title: announcement.title, audience: announcement.audience, isPinned: announcement.isPinned },
  });

  return announcement;
}

export async function deleteAnnouncement(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, title: true, audience: true },
  });
  if (!existing) throw ApiError.notFound('Announcement not found');

  // Reads cascade with the row, so no extra cleanup is needed here.
  await prisma.announcement.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.ANNOUNCEMENT_DELETE,
    entity: 'Announcement',
    entityId: id,
    meta,
    oldValue: { title: existing.title, audience: existing.audience },
  });

  return { id };
}

/** Idempotent: marking an already read announcement returns the original stamp. */
export async function markAnnouncementRead(id: string, viewer: Viewer) {
  const announcement = await prisma.announcement.findFirst({
    where: { id, AND: [visibleWhere(viewer)] },
    select: { id: true },
  });
  if (!announcement) throw ApiError.notFound('Announcement not found');

  const read = await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: viewer.userId } },
    update: {},
    create: { announcementId: id, userId: viewer.userId },
    select: { announcementId: true, readAt: true },
  });

  return { id: read.announcementId, readAt: read.readAt };
}

export async function unreadAnnouncementCount(viewer: Viewer): Promise<number> {
  return prisma.announcement.count({
    where: {
      AND: [visibleWhere(viewer), { reads: { none: { userId: viewer.userId } } }],
    },
  });
}
