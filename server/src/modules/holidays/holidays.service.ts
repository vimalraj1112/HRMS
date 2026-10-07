import { AuditAction, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { toUtcDate, todayUtc } from '../../utils/workdays';
import type { Actor } from '../leave/leave.service';
import type { CreateHolidayBody, ListHolidaysQuery, UpdateHolidayBody } from './holidays.validator';

const HOLIDAY_SELECT = {
  id: true,
  name: true,
  date: true,
  type: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listHolidays(query: ListHolidaysQuery) {
  const where: Prisma.HolidayWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.type ? { type: query.type } : {}),
    ...(query.year
      ? {
          date: {
            gte: new Date(Date.UTC(Number(query.year), 0, 1)),
            lt: new Date(Date.UTC(Number(query.year) + 1, 0, 1)),
          },
        }
      : {}),
    ...(query.from || query.to
      ? {
          AND: [
            { date: { ...(query.to ? { lte: toUtcDate(query.to) } : {}) } },
            { date: { ...(query.from ? { gte: toUtcDate(query.from) } : {}) } },
          ],
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { description: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.holiday.findMany({
      where,
      select: HOLIDAY_SELECT,
      orderBy: { date: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.holiday.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getHoliday(id: string) {
  const holiday = await prisma.holiday.findUnique({ where: { id }, select: HOLIDAY_SELECT });
  if (!holiday) throw ApiError.notFound('Holiday not found');
  return holiday;
}

async function assertHolidayUnique(name: string, date: Date, ignoreId?: string): Promise<void> {
  const clash = await prisma.holiday.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, date, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });

  if (clash) throw ApiError.conflict('A holiday with this name already exists on that date');
}

export async function createHoliday(body: CreateHolidayBody, actor: Actor, meta: RequestMeta) {
  const date = toUtcDate(body.date);
  await assertHolidayUnique(body.name, date);

  const holiday = await prisma.holiday.create({
    data: {
      name: body.name,
      date,
      type: body.type,
      description: body.description ?? null,
      isActive: body.isActive,
    },
    select: HOLIDAY_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.HOLIDAY_CREATE,
    entity: 'Holiday',
    entityId: holiday.id,
    meta,
    newValue: { name: holiday.name, date: holiday.date, type: holiday.type },
  });

  return holiday;
}

export async function updateHoliday(id: string, body: UpdateHolidayBody, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.holiday.findUnique({ where: { id }, select: HOLIDAY_SELECT });
  if (!existing) throw ApiError.notFound('Holiday not found');

  const name = body.name ?? existing.name;
  const date = body.date ? toUtcDate(body.date) : existing.date;
  await assertHolidayUnique(name, date, id);

  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.date !== undefined ? { date } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    select: HOLIDAY_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.HOLIDAY_UPDATE,
    entity: 'Holiday',
    entityId: id,
    meta,
    oldValue: { name: existing.name, date: existing.date, type: existing.type, isActive: existing.isActive },
    newValue: { name: holiday.name, date: holiday.date, type: holiday.type, isActive: holiday.isActive },
  });

  return holiday;
}

export async function deleteHoliday(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.holiday.findUnique({
    where: { id },
    select: { id: true, name: true, date: true },
  });
  if (!existing) throw ApiError.notFound('Holiday not found');

  const upcomingLeave = await prisma.leaveRequest.count({
    where: {
      status: 'APPROVED',
      startDate: { lte: existing.date },
      endDate: { gte: existing.date },
    },
  });

  if (upcomingLeave > 0) {
    throw ApiError.conflict('Approved leave exists on this holiday date, so it can only be deactivated');
  }

  await prisma.holiday.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.HOLIDAY_DELETE,
    entity: 'Holiday',
    entityId: id,
    meta,
    oldValue: { name: existing.name, date: existing.date },
  });

  return { id, name: existing.name, date: existing.date, isPast: existing.date < todayUtc() };
}
