import { z } from 'zod';

function isRealCalendarDate(value: string): boolean {
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')
  .refine(isRealCalendarDate, 'Must be a real calendar date');

export const monthSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])$/, 'Month must be between 01 and 12');

export const yearSchema = z
  .string()
  .regex(/^\d{4}$/, 'Year must be a 4 digit year')
  .refine((value) => Number(value) >= 1970 && Number(value) <= 2200, 'Year is out of range');

export const idParamSchema = z.object({
  id: z.string().min(1, 'Id is required').max(64),
});

/** Query string flags arrive as text, so `?flag=false` must not become `true`. */
export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const emailSchema = z.string().trim().toLowerCase().email('Must be a valid email address').max(160);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s()-]{7,20}$/, 'Must be a valid phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const nonNegativeNumber = z.coerce.number().min(0, 'Must be zero or greater');
export const positiveNumber = z.coerce.number().positive('Must be greater than zero');
