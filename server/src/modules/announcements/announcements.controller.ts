import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getParams, getQuery } from '../../utils/request';
import type { Actor } from '../leave/leave.service';
import * as announcementsService from './announcements.service';
import type { CreateAnnouncementBody, ListAnnouncementsQuery, UpdateAnnouncementBody } from './announcements.validator';

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    employeeId: req.user.employeeId,
  };
}

/** Audience matching needs the profile the auth middleware already loaded. */
function viewerOf(req: Request): announcementsService.Viewer {
  if (!req.user) throw ApiError.unauthorized();
  return {
    userId: req.user.id,
    role: req.user.role,
    employeeId: req.user.employeeId ?? null,
    departmentId: req.authEmployee?.departmentId ?? null,
    designationId: req.authEmployee?.designation?.id ?? null,
  };
}

export async function listAnnouncementsController(req: Request, res: Response): Promise<void> {
  const result = await announcementsService.listAnnouncements(viewerOf(req), getQuery<ListAnnouncementsQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Announcements retrieved');
}

export async function unreadCountController(req: Request, res: Response): Promise<void> {
  const count = await announcementsService.unreadAnnouncementCount(viewerOf(req));
  sendSuccess(res, { unreadCount: count }, 'Unread announcements counted');
}

export async function getAnnouncementController(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.getAnnouncement(getParams<{ id: string }>(req).id, viewerOf(req));
  sendSuccess(res, announcement, 'Announcement retrieved');
}

export async function createAnnouncementController(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.createAnnouncement(
    req.validated?.body as CreateAnnouncementBody,
    viewerOf(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendCreated(res, announcement, 'Announcement published');
}

export async function updateAnnouncementController(req: Request, res: Response): Promise<void> {
  const announcement = await announcementsService.updateAnnouncement(
    getParams<{ id: string }>(req).id,
    req.validated?.body as UpdateAnnouncementBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, announcement, 'Announcement updated');
}

export async function deleteAnnouncementController(req: Request, res: Response): Promise<void> {
  const result = await announcementsService.deleteAnnouncement(
    getParams<{ id: string }>(req).id,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, result, 'Announcement deleted');
}

export async function markAnnouncementReadController(req: Request, res: Response): Promise<void> {
  const result = await announcementsService.markAnnouncementRead(getParams<{ id: string }>(req).id, viewerOf(req));
  sendSuccess(res, result, 'Announcement marked as read');
}
