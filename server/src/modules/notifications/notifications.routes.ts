import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listNotificationsController,
  markAllReadController,
  markReadController,
  markUnreadController,
  unreadCountController,
} from './notifications.controller';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.validator';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  requirePermission(PERMISSIONS.NOTIFICATION_READ_OWN),
  validate({ query: listNotificationsQuerySchema }),
  listNotificationsController,
);

notificationsRouter.get(
  '/unread-count',
  requirePermission(PERMISSIONS.NOTIFICATION_READ_OWN),
  unreadCountController,
);

notificationsRouter.post(
  '/read-all',
  requirePermission(PERMISSIONS.NOTIFICATION_READ_OWN),
  markAllReadController,
);

notificationsRouter.patch(
  '/:id/read',
  requirePermission(PERMISSIONS.NOTIFICATION_READ_OWN),
  validate({ params: notificationIdParamSchema }),
  markReadController,
);

notificationsRouter.patch(
  '/:id/unread',
  requirePermission(PERMISSIONS.NOTIFICATION_READ_OWN),
  validate({ params: notificationIdParamSchema }),
  markUnreadController,
);