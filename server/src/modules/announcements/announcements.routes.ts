import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createAnnouncementController,
  deleteAnnouncementController,
  getAnnouncementController,
  listAnnouncementsController,
  markAnnouncementReadController,
  unreadCountController,
  updateAnnouncementController,
} from './announcements.controller';
import {
  announcementIdParamSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './announcements.validator';

export const announcementsRouter = Router();

announcementsRouter.use(authenticate);

announcementsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_READ),
  validate({ query: listAnnouncementsQuerySchema }),
  listAnnouncementsController,
);

// Must stay above `/:id` or `unread-count` would be parsed as an id.
announcementsRouter.get(
  '/unread-count',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_READ),
  unreadCountController,
);

announcementsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_READ),
  validate({ params: announcementIdParamSchema }),
  getAnnouncementController,
);

announcementsRouter.post(
  '/',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE),
  validate({ body: createAnnouncementSchema }),
  createAnnouncementController,
);

announcementsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE),
  validate({ params: announcementIdParamSchema, body: updateAnnouncementSchema }),
  updateAnnouncementController,
);

announcementsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE),
  validate({ params: announcementIdParamSchema }),
  deleteAnnouncementController,
);

announcementsRouter.post(
  '/:id/read',
  requirePermission(PERMISSIONS.ANNOUNCEMENT_READ),
  validate({ params: announcementIdParamSchema }),
  markAnnouncementReadController,
);
