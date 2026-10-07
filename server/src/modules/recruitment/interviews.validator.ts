import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '../../validators/common.validator';
import { dateTimeSchema } from './jobs.validator';

export const interviewIdParamSchema = idParamSchema;

export const INTERVIEW_MODES = ['ONSITE', 'PHONE', 'VIDEO'] as const;
export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export const INTERVIEW_RECOMMENDATIONS = ['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE'] as const;

export const listInterviewsQuerySchema = paginationQuerySchema.extend({
  candidateId: z.string().uuid().optional(),
  interviewerId: z.string().uuid().optional(),
  status: z.enum(INTERVIEW_STATUSES).optional(),
});

export const createInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  round: z.coerce.number().int().min(1, 'Round must be at least 1').max(20).optional(),
  scheduledAt: dateTimeSchema,
  durationMinutes: z.coerce.number().int().min(15).max(600).optional(),
  mode: z.enum(INTERVIEW_MODES).optional(),
  locationOrLink: z.string().trim().max(255).optional(),
});

export const updateInterviewSchema = z
  .object({
    interviewerId: z.string().uuid().optional(),
    round: z.coerce.number().int().min(1).max(20).optional(),
    scheduledAt: dateTimeSchema.optional(),
    durationMinutes: z.coerce.number().int().min(15).max(600).optional(),
    mode: z.enum(INTERVIEW_MODES).optional(),
    locationOrLink: z.string().trim().max(255).optional(),
    status: z.enum(INTERVIEW_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export const submitFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  recommendation: z.enum(INTERVIEW_RECOMMENDATIONS, { message: 'Select a recommendation' }),
  feedback: z.string().trim().max(5000).optional(),
  strengths: z.string().trim().max(5000).optional(),
  improvements: z.string().trim().max(5000).optional(),
});

export type ListInterviewsQuery = z.infer<typeof listInterviewsQuerySchema>;
export type CreateInterviewBody = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewBody = z.infer<typeof updateInterviewSchema>;
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackSchema>;
