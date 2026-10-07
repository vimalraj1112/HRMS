import { z } from 'zod';
import { ROLES } from '../../config/rbac';
import { emailSchema, idParamSchema, paginationQuerySchema, passwordSchema } from '../../validators/common.validator';

export const userIdParamSchema = idParamSchema;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION']).optional(),
  unlinkedOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(255).optional(),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  employeeId: z.string().uuid().optional(),
  mustChangePassword: z.boolean().default(true),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema.optional(),
  mustChangePassword: z.boolean().default(true),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusBody = z.infer<typeof updateUserStatusSchema>;
export type CreateUserBody = z.infer<typeof createUserSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
