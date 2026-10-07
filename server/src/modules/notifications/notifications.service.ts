import type { NotificationType, Prisma } from '@prisma/client';
import type { AppRole } from '../../config/rbac';
import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import type { ListNotificationsQuery } from './notifications.validator';

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  employeeId: true,
  type: true,
  title: true,
  message: true,
  link: true,
  entityType: true,
  entityId: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const;

export interface NotifyInput {
  userId: string;
  employeeId?: string | null;
  type?: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Notifications are advisory, so a failure here must never break the business
 * action that triggered it.
 */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        employeeId: input.employeeId ?? null,
        type: input.type ?? 'INFO',
        title: input.title.slice(0, 160),
        message: input.message,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, title: input.title }, 'Failed to record notification');
  }
}

/** Notifies the user linked to an employee, if that employee has an account. */
export async function notifyEmployee(
  employeeId: string,
  input: Omit<NotifyInput, 'userId' | 'employeeId'>,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { employeeId, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!user) return;
  await notifyUser({ ...input, userId: user.id, employeeId });
}

/**
 * Notifies every active user holding one of the given roles. Used when work is
 * queued for a team, such as an employee submitting a document for verification.
 */
export async function notifyRole(
  roles: readonly AppRole[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: [...roles] }, status: 'ACTIVE' },
    select: { id: true },
  });

  await Promise.all(users.map((user) => notifyUser({ ...input, userId: user.id })));
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.unreadOnly ? { isRead: false } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    items,
    meta: buildPaginationMeta(query.page, query.limit, total),
    unreadCount,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(id: string, userId: string) {
  const notification = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
  if (!notification) throw ApiError.notFound('Notification not found');

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
    select: NOTIFICATION_SELECT,
  });

  return updated;
}

export async function markUnread(id: string, userId: string) {
  const notification = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
  if (!notification) throw ApiError.notFound('Notification not found');

  return prisma.notification.update({
    where: { id },
    data: { isRead: false, readAt: null },
    select: NOTIFICATION_SELECT,
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return result.count;
}