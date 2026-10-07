import { z } from 'zod';
import { emailSchema, idParamSchema, paginationQuerySchema, phoneSchema } from '../../validators/common.validator';

export const candidateIdParamSchema = idParamSchema;

export const CANDIDATE_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
  'OFFERED',
  'HIRED',
  'WITHDRAWN',
] as const;

/** Blank form values are cleared rather than sent as empty strings. */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

const optionalText = (max: number) => blank(z.string().trim().max(max));

const sharedCandidateFields = {
  firstName: blank(z.string().trim().min(1, 'First name is required').max(80)),
  lastName: blank(z.string().trim().min(1, 'Last name is required').max(80)),
  email: blank(emailSchema),
  phone: blank(phoneSchema),
  jobOpeningId: blank(z.string().uuid()),
  currentCompany: optionalText(120),
  currentDesignation: optionalText(120),
  experienceYears: blank(z.coerce.number().min(0).max(50)),
  expectedSalary: blank(z.coerce.number().min(0)),
  source: optionalText(120),
  notes: optionalText(5000),
};

export const listCandidatesQuerySchema = paginationQuerySchema.extend({
  jobOpeningId: z.string().uuid().optional(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
});

export const createCandidateSchema = z.object({
  ...sharedCandidateFields,
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: emailSchema,
  status: z.enum(CANDIDATE_STATUSES).optional(),
});

export const updateCandidateSchema = z
  .object({
    ...sharedCandidateFields,
    status: z.enum(CANDIDATE_STATUSES).optional(),
    rejectionReason: optionalText(2000),
    employeeId: blank(z.string().uuid()),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export type ListCandidatesQuery = z.infer<typeof listCandidatesQuerySchema>;
export type CreateCandidateBody = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateBody = z.infer<typeof updateCandidateSchema>;
