import { z } from 'zod';
import {
  booleanQuerySchema,
  dateOnlySchema,
  idParamSchema,
  nonNegativeNumber,
  paginationQuerySchema,
  phoneSchema,
  yearSchema,
} from '../../validators/common.validator';

const leaveStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
const leaveUnitSchema = z.enum(['DAYS', 'HOURS']);

export const leaveIdParamSchema = idParamSchema;

export const listLeaveRequestsQuerySchema = paginationQuerySchema
  .extend({
    status: leaveStatusSchema.optional(),
    leaveTypeId: z.string().uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    employeeId: z.string().uuid().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'The to date cannot be before the from date',
  });

export const leaveBalancesQuerySchema = z.object({
  year: yearSchema.optional(),
});

export const adjustBalanceSchema = z
  .object({
    allocated: nonNegativeNumber.optional(),
    carriedForward: nonNegativeNumber.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.allocated !== undefined || value.carriedForward !== undefined, {
    path: ['allocated'],
    message: 'Provide an allocation, a carry forward amount, or both',
  });

export const rolloverBalancesQuerySchema = z
  .object({
    fromYear: yearSchema,
    toYear: yearSchema,
  })
  .refine((value) => Number(value.toYear) === Number(value.fromYear) + 1, {
    path: ['toYear'],
    message: 'Balances can only be rolled forward one year at a time',
  });

export const applyLeaveSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500),
    contactDuringLeave: phoneSchema.optional(),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'The end date cannot be before the start date',
  });

export const decideLeaveSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    remark: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.decision === 'APPROVE' || Boolean(value.remark), {
    path: ['remark'],
    message: 'A remark is required when rejecting a request',
  });

export const cancelLeaveSchema = z.object({
  reason: z.string().trim().min(3, 'A cancellation reason is required').max(255),
});

export const listLeaveTypesQuerySchema = paginationQuerySchema.extend({
  includeInactive: booleanQuerySchema.default(false),
});

const leaveTypeFields = {
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes or underscores only')
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  unit: leaveUnitSchema.default('DAYS'),
  annualQuota: nonNegativeNumber,
  isPaid: z.boolean().default(true),
  allowsCarryForward: z.boolean().default(false),
  maxCarryForward: nonNegativeNumber.default(0),
  requiresDocument: z.boolean().default(false),
  minDaysNotice: z.coerce.number().int().min(0, 'Cannot be negative').max(365).default(0),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex colour such as #3b82f6').optional(),
  isActive: z.boolean().default(true),
};

export const createLeaveTypeSchema = z
  .object(leaveTypeFields)
  .refine((value) => !value.allowsCarryForward || value.maxCarryForward > 0, {
    path: ['maxCarryForward'],
    message: 'Set a carry forward limit greater than zero when carry forward is enabled',
  })
  .refine((value) => value.unit !== 'HOURS' || value.annualQuota % 8 === 0, {
    path: ['annualQuota'],
    message: 'Hour based quotas must be a multiple of 8',
  });

export const updateLeaveTypeSchema = z.object(leaveTypeFields).partial();

export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;
export type LeaveBalancesQuery = z.infer<typeof leaveBalancesQuerySchema>;
export type AdjustBalanceBody = z.infer<typeof adjustBalanceSchema>;
export type RolloverBalancesQuery = z.infer<typeof rolloverBalancesQuerySchema>;
export type ApplyLeaveBody = z.infer<typeof applyLeaveSchema>;
export type DecideLeaveBody = z.infer<typeof decideLeaveSchema>;
export type CancelLeaveBody = z.infer<typeof cancelLeaveSchema>;
export type ListLeaveTypesQuery = z.infer<typeof listLeaveTypesQuerySchema>;
export type CreateLeaveTypeBody = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeBody = z.infer<typeof updateLeaveTypeSchema>;
