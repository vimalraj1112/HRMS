import { z } from 'zod';
import { dateOnlySchema, paginationQuerySchema } from '../../validators/common.validator';

export const weeklyTimesheetQuerySchema = paginationQuerySchema.extend({
  /** Any date inside the requested Monday-Sunday week. Defaults to the current week. */
  weekOf: dateOnlySchema.optional(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export type WeeklyTimesheetQuery = z.infer<typeof weeklyTimesheetQuerySchema>;
