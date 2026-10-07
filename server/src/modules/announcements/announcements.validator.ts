import { z } from 'zod';
import { ROLES } from '../../config/rbac';
import { booleanQuerySchema, paginationQuerySchema } from '../../validators/common.validator';

// Ids are Prisma UUIDs; validating here turns a malformed path segment into a
// 400 instead of a database error.
export const announcementIdParamSchema = z.object({
  id: z.string().uuid('Id must be a valid UUID'),
});

export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'DEPARTMENT', 'DESIGNATION', 'ROLE', 'EMPLOYEE'] as const;

export const listAnnouncementsQuerySchema = paginationQuerySchema.extend({
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
  pinnedOnly: booleanQuerySchema.optional(),
});

/**
 * Timestamps accept a full ISO string or a bare `YYYY-MM-DD`; the service reads
 * a bare date as the start (published) or end (expires) of that day.
 */
const timestampSchema = z.string().trim().min(4).max(40);

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(200),
  content: z.string().trim().min(1, 'Content is required').max(5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('ALL'),
  departmentId: z.string().uuid().nullish(),
  designationId: z.string().uuid().nullish(),
  role: z.enum(ROLES).nullish(),
  employeeId: z.string().uuid().nullish(),
  isPinned: z.boolean().default(false),
  publishedAt: timestampSchema.nullish(),
  expiresAt: timestampSchema.nullish(),
});

export const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(200).optional(),
    content: z.string().trim().min(1, 'Content is required').max(5000).optional(),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
    departmentId: z.string().uuid().nullish(),
    designationId: z.string().uuid().nullish(),
    role: z.enum(ROLES).nullish(),
    employeeId: z.string().uuid().nullish(),
    isPinned: z.boolean().optional(),
    publishedAt: timestampSchema.nullish(),
    expiresAt: timestampSchema.nullish(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type CreateAnnouncementBody = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementBody = z.infer<typeof updateAnnouncementSchema>;
