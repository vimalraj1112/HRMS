import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '../../validators/common.validator';

export const documentIdParamSchema = idParamSchema;

export const DOCUMENT_TYPES = [
  'AADHAAR',
  'PAN',
  'PASSPORT',
  'OFFER_LETTER',
  'EXPERIENCE_LETTER',
  'EDUCATION_CERTIFICATE',
  'BANK_DOCUMENT',
  'ADDRESS_PROOF',
  'OTHER',
] as const;

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  employeeId: z.string().uuid().optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  isVerified: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === true || value === 'true')),
  // Expiring soon means the document lapses within this many days.
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  includeDeleted: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const uploadDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(2, 'Title is required').max(160),
  // Multipart bodies arrive as strings, so an absent value must stay optional.
  employeeId: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().uuid().optional(),
  ),
  expiresAt: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format').optional(),
  ),
});

export const verifyDocumentSchema = z.object({
  isVerified: z.boolean(),
  remark: z.string().trim().max(500).optional().or(z.literal('')),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type UploadDocumentBody = z.infer<typeof uploadDocumentSchema>;
export type VerifyDocumentBody = z.infer<typeof verifyDocumentSchema>;