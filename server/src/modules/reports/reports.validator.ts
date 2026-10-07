import { z } from 'zod';
import { dateOnlySchema } from '../../validators/common.validator';

export const REPORT_TYPES = ['overview', 'headcount', 'attendance', 'leave', 'payroll'] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

const rangeShape = {
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
};

const fromBeforeTo = {
  message: '`from` must be on or before `to`',
  path: ['from'],
};

export const rangeQuerySchema = z
  .object(rangeShape)
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, fromBeforeTo);

export const payrollReportQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2200),
});

export const exportReportQuerySchema = z
  .object({
    report: z.enum(REPORT_TYPES).default('overview'),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2200).optional(),
    format: z.enum(['csv', 'json']).default('csv'),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, fromBeforeTo)
  .refine((query) => query.report !== 'payroll' || (query.month !== undefined && query.year !== undefined), {
    message: '`month` and `year` are required for the payroll report',
    path: ['month'],
  });

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type PayrollReportQuery = z.infer<typeof payrollReportQuerySchema>;
export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;
