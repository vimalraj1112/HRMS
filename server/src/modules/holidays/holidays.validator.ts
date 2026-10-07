import { z } from 'zod';
import {
  booleanQuerySchema,
  dateOnlySchema,
  idParamSchema,
  paginationQuerySchema,
  yearSchema,
} from '../../validators/common.validator';

const holidayTypeSchema = z.enum(['PUBLIC', 'OPTIONAL', 'RESTRICTED']);

export const holidayIdParamSchema = idParamSchema;

export const listHolidaysQuerySchema = paginationQuerySchema
  .extend({
    year: yearSchema.optional(),
    type: holidayTypeSchema.optional(),
    includeInactive: booleanQuerySchema.default(false),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'The to date cannot be before the from date',
  });

export const createHolidaySchema = z.object({
  name: z.string().trim().min(2).max(120),
  date: dateOnlySchema,
  type: holidayTypeSchema.default('PUBLIC'),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});

export const updateHolidaySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  date: dateOnlySchema.optional(),
  type: holidayTypeSchema.optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;
export type CreateHolidayBody = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayBody = z.infer<typeof updateHolidaySchema>;
