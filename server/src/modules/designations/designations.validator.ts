import { z } from 'zod';
import { booleanQuerySchema, idParamSchema, paginationQuerySchema } from '../../validators/common.validator';

export const designationIdParamSchema = idParamSchema;

export const listDesignationsQuerySchema = paginationQuerySchema.extend({
  includeInactive: booleanQuerySchema.default(false),
});

const codeSchema = z
  .string()
  .trim()
  .min(2, 'Code is required')
  .max(20)
  .toUpperCase()
  .regex(/^[A-Z0-9_-]+$/, 'Code may only contain letters, numbers, dashes and underscores');

export const createDesignationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: codeSchema,
  level: z.coerce.number().int().min(1).max(20).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});

export const updateDesignationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: codeSchema.optional(),
    level: z.coerce.number().int().min(1).max(20).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export type ListDesignationsQuery = z.infer<typeof listDesignationsQuerySchema>;
export type CreateDesignationBody = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationBody = z.infer<typeof updateDesignationSchema>;
