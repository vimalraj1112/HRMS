import type { Request, Response } from 'express';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import * as notificationsService from './notifications.service';
import type { ListNotificationsQuery } from './notifications.validator';

function userIdOf(req: Request): string {
  const userId = req.user?.id ?? '';
  if (!userId) throw new Error('Authenticated user id is missing');
  return userId;
}

export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const result = await notificationsService.listNotifications(userIdOf(req), getQuery<ListNotificationsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Notifications retrieved', { unreadCount: result.unreadCount });
}

export async function unreadCountController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { unreadCount: await notificationsService.unreadCount(userIdOf(req)) }, 'Unread count retrieved');
}

export async function markReadController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await notificationsService.markRead(id, userIdOf(req)), 'Notification marked as read');
}

export async function markUnreadController(req: Request, res: Response): Promise<void> {
  const { id } = getParams<{ id: string }>(req);
  sendSuccess(res, await notificationsService.markUnread(id, userIdOf(req)), 'Notification marked as unread');
}

export async function markAllReadController(req: Request, res: Response): Promise<void> {
  const updated = await notificationsService.markAllRead(userIdOf(req));
  sendSuccess(res, { updated }, 'All notifications marked as read');
}