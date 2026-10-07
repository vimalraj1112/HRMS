import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '../../validators/common.validator';

export const jobIdParamSchema = idParamSchema;

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED'] as const;

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'] as const;

/** Instant timestamps arrive as ISO strings; offsets are allowed so clients may send local time. */
export const dateTimeSchema = z.iso.datetime({ offset: true });

const optionalUuid = z.string().uuid().optional();

const optionalAmount = z.coerce.number().min(0).optional();

export const listJobsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
  departmentId: optionalUuid,
});

const sharedJobFields = {
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(160),
  departmentId: optionalUuid,
  designationId: optionalUuid,
  hiringManagerId: optionalUuid,
  location: z.string().trim().max(120).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  openingsCount: z.coerce.number().int().min(1).max(500).optional(),
  description: z.string().trim().min(2, 'Description is required').max(20000),
  requirements: z.string().trim().max(20000).optional(),
  minExperience: z.coerce.number().int().min(0).max(50).optional(),
  maxExperience: z.coerce.number().int().min(0).max(50).optional(),
  salaryMin: optionalAmount,
  salaryMax: optionalAmount,
  publishedAt: dateTimeSchema.optional(),
  status: z.enum(JOB_STATUSES).optional(),
};

function withinRange(value: { minExperience?: number; maxExperience?: number; salaryMin?: number; salaryMax?: number }) {
  const experienceOk =
    value.minExperience === undefined || value.maxExperience === undefined || value.minExperience <= value.maxExperience;
  const salaryOk = value.salaryMin === undefined || value.salaryMax === undefined || value.salaryMin <= value.salaryMax;
  return experienceOk && salaryOk;
}

export const createJobSchema = z
  .object(sharedJobFields)
  .refine(withinRange, {
    message: 'Experience and salary ranges must be ordered from minimum to maximum',
  });

export const updateJobSchema = z
  .object({
    ...sharedJobFields,
    title: sharedJobFields.title.optional(),
    description: sharedJobFields.description.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine(withinRange, {
    message: 'Experience and salary ranges must be ordered from minimum to maximum',
  });

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
export type CreateJobBody = z.infer<typeof createJobSchema>;
export type UpdateJobBody = z.infer<typeof updateJobSchema>;
