import { z } from 'zod';
import { dateOnlySchema, idParamSchema, paginationQuerySchema } from '../../validators/common.validator';

export const auditIdParamSchema = idParamSchema;

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend({
    action: z.string().trim().min(1).max(60).optional(),
    entity: z.string().trim().min(1).max(60).optional(),
    entityId: z.string().trim().min(1).max(60).optional(),
    userId: z.string().uuid().optional(),
    userEmail: z.string().trim().min(1).max(160).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'The to date cannot be before the from date',
  });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;