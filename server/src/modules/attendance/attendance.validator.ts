import { z } from 'zod';
import {
  dateOnlySchema,
  idParamSchema,
  monthSchema,
  paginationQuerySchema,
  yearSchema,
} from '../../validators/common.validator';

const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF']);
const attendanceSourceSchema = z.enum(['MANUAL', 'BIOMETRIC', 'IMPORT', 'SYSTEM']);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24 hour HH:MM format');

const MARKABLE_BY_EMPLOYEE = ['PRESENT', 'HALF_DAY', 'LATE'] as const;

export const attendanceIdParamSchema = idParamSchema;

export const listAttendanceQuerySchema = paginationQuerySchema
  .extend({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    status: attendanceStatusSchema.optional(),
    source: attendanceSourceSchema.optional(),
    employeeId: z.string().uuid().optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    { path: ['to'], message: 'The to date cannot be before the from date' },
  );

export const attendanceSummaryQuerySchema = paginationQuerySchema.pick({ page: true, limit: true }).extend({
  month: monthSchema,
  year: yearSchema,
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

const attendanceFields = {
  status: attendanceStatusSchema.optional(),
  checkIn: timeSchema.optional(),
  checkOut: timeSchema.optional(),
  workFrom: z.string().trim().max(120).optional(),
  workTo: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(255).optional(),
};

const checkInOutOrder = (value: { checkIn?: string; checkOut?: string }): boolean => {
  if (!value.checkIn || !value.checkOut) return true;
  return value.checkIn < value.checkOut;
};

export const markAttendanceSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    date: dateOnlySchema,
    ...attendanceFields,
    status: attendanceStatusSchema.default('PRESENT'),
  })
  .refine(checkInOutOrder, { path: ['checkOut'], message: 'Check out must be after check in' })
  .refine(
    (value) =>
      !value.status ||
      !MARKABLE_BY_EMPLOYEE.includes(value.status as (typeof MARKABLE_BY_EMPLOYEE)[number]) ||
      Boolean(value.checkIn),
    { path: ['checkIn'], message: 'Check in time is required when marking present, late or a half day' },
  );

export const correctAttendanceSchema = z
  .object(attendanceFields)
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine(checkInOutOrder, { path: ['checkOut'], message: 'Check out must be after check in' });

export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;
export type MarkAttendanceBody = z.infer<typeof markAttendanceSchema>;
export type CorrectAttendanceBody = z.infer<typeof correctAttendanceSchema>;
