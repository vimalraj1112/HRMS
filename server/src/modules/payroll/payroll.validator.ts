import { z } from 'zod';
import { idParamSchema, nonNegativeNumber, paginationQuerySchema } from '../../validators/common.validator';

// Payroll periods are numeric, so they coerce "9" and "09" alike. This is
// deliberately different from the string month/year query params used elsewhere.
const yearFilter = z.coerce.number().int().min(1970).max(2200);
const monthFilter = z.coerce.number().int().min(1).max(12);

export const payrollIdParamSchema = idParamSchema;

export const listSalaryStructuresQuerySchema = paginationQuerySchema.extend({
  employeeId: z.string().uuid().optional(),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === true || value === 'true')),
});

const effectiveFromSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

// Amounts default to zero on create; on update every field stays optional so that
// "not supplied" is distinguishable from "set to zero".
export const createSalaryStructureSchema = z
  .object({
    employeeId: z.string().uuid(),
    effectiveFrom: effectiveFromSchema,
    basicSalary: nonNegativeNumber,
    hra: nonNegativeNumber.default(0),
    transportAllowance: nonNegativeNumber.default(0),
    medicalAllowance: nonNegativeNumber.default(0),
    otherAllowance: nonNegativeNumber.default(0),
    pf: nonNegativeNumber.default(0),
    esi: nonNegativeNumber.default(0),
    professionalTax: nonNegativeNumber.default(0),
    tds: nonNegativeNumber.default(0),
    otherDeduction: nonNegativeNumber.default(0),
    isActive: z.boolean().default(true),
  })
  .refine((value) => value.basicSalary > 0, {
    path: ['basicSalary'],
    message: 'Basic salary must be greater than zero',
  });

export const updateSalaryStructureSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    effectiveFrom: effectiveFromSchema.optional(),
    basicSalary: nonNegativeNumber.optional(),
    hra: nonNegativeNumber.optional(),
    transportAllowance: nonNegativeNumber.optional(),
    medicalAllowance: nonNegativeNumber.optional(),
    otherAllowance: nonNegativeNumber.optional(),
    pf: nonNegativeNumber.optional(),
    esi: nonNegativeNumber.optional(),
    professionalTax: nonNegativeNumber.optional(),
    tds: nonNegativeNumber.optional(),
    otherDeduction: nonNegativeNumber.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine((value) => value.basicSalary === undefined || value.basicSalary > 0, {
    path: ['basicSalary'],
    message: 'Basic salary must be greater than zero',
  });

export const listPayrollRunsQuerySchema = paginationQuerySchema.extend({
  year: yearFilter.optional(),
  month: monthFilter.optional(),
  status: z.enum(['DRAFT', 'PROCESSED', 'LOCKED']).optional(),
});

export const processPayrollSchema = z.object({
  year: yearFilter,
  month: monthFilter,
  notes: z.string().trim().max(500).optional(),
});

export const listPayslipsQuerySchema = paginationQuerySchema.extend({
  year: yearFilter.optional(),
  month: monthFilter.optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PROCESSED', 'LOCKED']).optional(),
});

export type ListSalaryStructuresQuery = z.infer<typeof listSalaryStructuresQuerySchema>;
export type CreateSalaryStructureBody = z.infer<typeof createSalaryStructureSchema>;
export type UpdateSalaryStructureBody = z.infer<typeof updateSalaryStructureSchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsQuerySchema>;
export type ProcessPayrollBody = z.infer<typeof processPayrollSchema>;
export type ListPayslipsQuery = z.infer<typeof listPayslipsQuerySchema>;