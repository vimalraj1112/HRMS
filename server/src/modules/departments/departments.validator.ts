import { z } from 'zod';
import { booleanQuerySchema, idParamSchema, paginationQuerySchema } from '../../validators/common.validator';

export const departmentIdParamSchema = idParamSchema;

export const listDepartmentsQuerySchema = paginationQuerySchema.extend({
  includeInactive: booleanQuerySchema.default(false),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code is required')
    .max(20)
    .toUpperCase()
    .regex(/^[A-Z0-9_-]+$/, 'Code may only contain letters, numbers, dashes and underscores'),
  description: z.string().trim().max(500).optional(),
  headId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().min(2).max(20).toUpperCase().regex(/^[A-Z0-9_-]+$/).optional(),
    description: z.string().trim().max(500).optional(),
    headId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
export type CreateDepartmentBody = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentSchema>;
