import { z } from 'zod';
import { dateOnlySchema, idParamSchema, paginationQuerySchema } from '../../validators/common.validator';
import { dateTimeSchema } from './jobs.validator';

export const offerIdParamSchema = idParamSchema;

export const OFFER_STATUSES = ['DRAFT', 'EXTENDED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;

export const listOffersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OFFER_STATUSES).optional(),
  candidateId: z.string().uuid().optional(),
});

const optionalReference = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().uuid().optional(),
);

const sharedOfferFields = {
  candidateId: z.string().uuid().optional(),
  jobOpeningId: optionalReference,
  employeeId: optionalReference,
  departmentId: optionalReference,
  designationId: optionalReference,
  annualCtc: z.coerce.number().positive('Annual CTC must be greater than zero').optional(),
  joiningDate: z.preprocess((value) => (value === '' || value === null ? undefined : value), dateOnlySchema.optional()),
  expiresAt: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    dateTimeSchema.optional(),
  ),
  notes: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().max(5000).optional()),
  status: z.enum(OFFER_STATUSES).optional(),
};

export const createOfferSchema = z.object({
  ...sharedOfferFields,
  candidateId: z.string().uuid('A candidate is required'),
  annualCtc: z.coerce.number().positive('Annual CTC must be greater than zero'),
  status: z.enum(OFFER_STATUSES).optional(),
});

export const updateOfferSchema = z
  .object(sharedOfferFields)
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export const respondToOfferSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED'], { message: 'Respond with ACCEPTED or REJECTED' }),
  notes: z.string().trim().max(5000).optional(),
});

export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
export type CreateOfferBody = z.infer<typeof createOfferSchema>;
export type UpdateOfferBody = z.infer<typeof updateOfferSchema>;
export type RespondToOfferBody = z.infer<typeof respondToOfferSchema>;
