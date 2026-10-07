import { z } from 'zod';
import { dateOnlySchema, paginationQuerySchema } from '../../validators/common.validator';

// Ids are Prisma UUIDs; validating here turns a malformed path segment into a
// 400 instead of a database error.
export const performanceIdParamSchema = z.object({
  id: z.string().uuid('Id must be a valid UUID'),
});

export const GOAL_TYPES = ['KPI', 'DEVELOPMENT', 'PROJECT'] as const;
export const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const REVIEW_PERIODS = ['QUARTERLY', 'HALF_YEARLY', 'ANNUAL'] as const;
export const REVIEW_STATUSES = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'] as const;

const weightField = z.coerce
  .number()
  .int('Weight must be a whole number')
  .min(0, 'Weight must be between 0 and 100')
  .max(100, 'Weight must be between 0 and 100');

const progressField = z.coerce
  .number()
  .int('Progress must be a whole number')
  .min(0, 'Progress must be between 0 and 100')
  .max(100, 'Progress must be between 0 and 100');

/** Textareas post empty strings, which must stay "not supplied" rather than erasing a value. */
function emptyToUndefined(value: unknown): unknown {
  return value === '' || value === null ? undefined : value;
}

function optionalText(max: number) {
  return z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
}

/** Ratings run 0-5 and keep at most two decimals so they fit Decimal(3, 2). */
const ratingField = z.coerce
  .number()
  .min(0, 'Rating must be between 0 and 5')
  .max(5, 'Rating must be between 0 and 5')
  .refine(
    (value) => Number.isFinite(value) && Number(value.toFixed(2)) === value,
    'Ratings allow at most 2 decimal places',
  );

const kpiInputSchema = z.object({
  title: z.string().trim().min(2, 'KPI title is required').max(200),
  description: optionalText(1000),
  targetValue: z.coerce.number().min(0, 'Target must be zero or greater'),
  unit: z.string().trim().max(40).optional(),
  weight: weightField.default(0),
});

const kpiProgressSchema = z.object({
  id: z.string().uuid(),
  currentValue: z.coerce.number().min(0, 'Current value must be zero or greater'),
  achieved: z.boolean().optional(),
});

export const listGoalsQuerySchema = paginationQuerySchema.extend({
  employeeId: z.string().uuid().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  type: z.enum(GOAL_TYPES).optional(),
  dueBefore: dateOnlySchema.optional(),
});

export const createGoalSchema = z.object({
  employeeId: z.string().uuid().optional(),
  title: z.string().trim().min(2, 'Title is required').max(200),
  description: optionalText(2000),
  type: z.enum(GOAL_TYPES).default('KPI'),
  status: z.enum(GOAL_STATUSES).default('NOT_STARTED'),
  weight: weightField.default(0),
  progress: progressField.default(0),
  startDate: dateOnlySchema.optional(),
  dueDate: dateOnlySchema.optional(),
  kpis: z.array(kpiInputSchema).max(20).optional(),
});

export const updateGoalSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(200).optional(),
    description: optionalText(2000),
    type: z.enum(GOAL_TYPES).optional(),
    status: z.enum(GOAL_STATUSES).optional(),
    weight: weightField.optional(),
    progress: progressField.optional(),
    startDate: dateOnlySchema.optional(),
    dueDate: dateOnlySchema.optional(),
    // Replace-on-write: the array becomes the complete KPI set for the goal.
    kpis: z.array(kpiInputSchema).max(20).optional(),
    kpiProgress: z.array(kpiProgressSchema).max(50).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine((value) => !(value.kpis && value.kpiProgress), {
    message: 'Send either kpis or kpiProgress, not both',
    path: ['kpis'],
  });

export const listReviewsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REVIEW_STATUSES).optional(),
  period: z.enum(REVIEW_PERIODS).optional(),
  employeeId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
});

export const createReviewSchema = z.object({
  employeeId: z.string().uuid(),
  reviewerId: z.string().uuid().optional(),
  period: z.enum(REVIEW_PERIODS).default('QUARTERLY'),
  periodStart: dateOnlySchema,
  periodEnd: dateOnlySchema,
  selfRating: ratingField.optional(),
  managerRating: ratingField.optional(),
  achievements: optionalText(4000),
  strengths: optionalText(4000),
  improvements: optionalText(4000),
  managerComments: optionalText(4000),
  employeeComments: optionalText(4000),
});

export const updateReviewSchema = z
  .object({
    reviewerId: z.string().uuid().optional(),
    period: z.enum(REVIEW_PERIODS).optional(),
    periodStart: dateOnlySchema.optional(),
    periodEnd: dateOnlySchema.optional(),
    selfRating: ratingField.optional(),
    managerRating: ratingField.optional(),
    achievements: optionalText(4000),
    strengths: optionalText(4000),
    improvements: optionalText(4000),
    managerComments: optionalText(4000),
    employeeComments: optionalText(4000),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

// `.default({})` lets a bare POST with no JSON body through: both endpoints
// work entirely off the stored review.
export const submitReviewSchema = z
  .object({
    managerRating: ratingField.optional(),
    managerComments: optionalText(4000),
  })
  .default({});

export const acknowledgeReviewSchema = z
  .object({
    employeeComments: optionalText(4000),
  })
  .default({});

export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
export type CreateGoalBody = z.infer<typeof createGoalSchema>;
export type UpdateGoalBody = z.infer<typeof updateGoalSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
export type CreateReviewBody = z.infer<typeof createReviewSchema>;
export type UpdateReviewBody = z.infer<typeof updateReviewSchema>;
export type SubmitReviewBody = z.infer<typeof submitReviewSchema>;
export type AcknowledgeReviewBody = z.infer<typeof acknowledgeReviewSchema>;
export type KpiInput = z.infer<typeof kpiInputSchema>;
