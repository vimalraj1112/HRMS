import { z } from 'zod';
import { dateOnlySchema, emailSchema, idParamSchema, paginationQuerySchema, phoneSchema } from '../../validators/common.validator';

export const employeeIdParamSchema = idParamSchema;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'ON_NOTE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']).optional(),
  unassigned: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

const employeeBase = {
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: emailSchema,
  phone: phoneSchema.optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: dateOnlySchema.optional(),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(80).default('India'),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  joiningDate: dateOnlySchema,
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']).default('FULL_TIME'),
  status: z.enum(['ACTIVE', 'ON_NOTE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED']).default('ACTIVE'),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  exitDate: dateOnlySchema.optional(),
  panNumber: z.string().trim().max(20).optional(),
  aadhaarNumber: z.string().trim().max(20).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankAccountNumber: z.string().trim().max(40).optional(),
  bankIfsc: z.string().trim().max(20).optional(),
};

export const createEmployeeSchema = z.object({
  ...employeeBase,
  /** Optional: the service allocates the next sequential code when omitted. */
  employeeCode: z.string().trim().min(1, 'Employee code is required').max(20).toUpperCase().optional(),
});

export const updateEmployeeSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(80).optional(),
    middleName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().min(1, 'Last name is required').max(80).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: dateOnlySchema.optional(),
    address: z.string().trim().max(255).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().max(80).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: phoneSchema.optional(),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']).optional(),
    departmentId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    managerId: z.string().uuid().optional(),
    panNumber: z.string().trim().max(20).optional(),
    aadhaarNumber: z.string().trim().max(20).optional(),
    bankName: z.string().trim().max(120).optional(),
    bankAccountNumber: z.string().trim().max(40).optional(),
    bankIfsc: z.string().trim().max(20).optional(),
    profilePhotoUrl: z.string().url().max(500).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export const changeEmployeeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'ON_NOTE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED']),
  exitDate: dateOnlySchema.optional(),
  reason: z.string().trim().max(255).optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type CreateEmployeeBody = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeSchema>;
export type ChangeEmployeeStatusBody = z.infer<typeof changeEmployeeStatusSchema>;
