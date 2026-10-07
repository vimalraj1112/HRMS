import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../validators/common.validator';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export type LoginBody = z.infer<typeof loginSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
