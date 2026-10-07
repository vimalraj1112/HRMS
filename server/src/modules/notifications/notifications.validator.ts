import type { z } from 'zod';
import {
  booleanQuerySchema,
  idParamSchema,
  paginationQuerySchema,
} from '../../validators/common.validator';

export const notificationIdParamSchema = idParamSchema;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: booleanQuerySchema.default(false),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;