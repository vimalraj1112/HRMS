import { z } from 'zod';
import {
  booleanQuerySchema,
  dateOnlySchema,
  idParamSchema,
  paginationQuerySchema,
} from '../../validators/common.validator';

export const assetIdParamSchema = idParamSchema;

export const ASSET_CATEGORIES = [
  'LAPTOP',
  'DESKTOP',
  'MONITOR',
  'MOBILE_PHONE',
  'TABLET',
  'SIM_CARD',
  'HEADSET',
  'PERIPHERAL',
  'PRINTER',
  'NETWORK_DEVICE',
  'SOFTWARE_LICENSE',
  'FURNITURE',
  'OTHER',
] as const;

export const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

/**
 * ASSIGNED is deliberately excluded: an asset becomes assigned only through the
 * assign endpoint, which also writes the hand-over history row.
 */
export const EDITABLE_ASSET_STATUSES = ['AVAILABLE', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const listAssetsQuerySchema = paginationQuerySchema.extend({
  category: z.enum(ASSET_CATEGORIES).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  assignedEmployeeId: z.string().uuid().optional(),
  unassigned: booleanQuerySchema.optional(),
  // Assets whose warranty lapses within this many days.
  warrantyExpiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  includeDeleted: booleanQuerySchema.optional(),
});

export const createAssetSchema = z.object({
  assetTag: z.string().trim().min(1, 'Asset tag is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(160),
  category: z.enum(ASSET_CATEGORIES),
  brand: optionalText(80),
  model: optionalText(120),
  serialNumber: optionalText(120),
  status: z.enum(EDITABLE_ASSET_STATUSES).default('AVAILABLE'),
  purchaseDate: dateOnlySchema.optional(),
  purchaseCost: z.coerce.number().min(0, 'Cost cannot be negative').max(99_999_999).optional(),
  vendor: optionalText(160),
  warrantyExpiry: dateOnlySchema.optional(),
  notes: optionalText(1000),
});

export const updateAssetSchema = z
  .object({
    assetTag: z.string().trim().min(1, 'Asset tag is required').max(40).optional(),
    name: z.string().trim().min(2, 'Name is required').max(160).optional(),
    category: z.enum(ASSET_CATEGORIES).optional(),
    brand: optionalText(80),
    model: optionalText(120),
    serialNumber: optionalText(120),
    status: z.enum(EDITABLE_ASSET_STATUSES).optional(),
    purchaseDate: dateOnlySchema.nullish(),
    purchaseCost: z.coerce.number().min(0).max(99_999_999).nullish(),
    vendor: optionalText(160),
    warrantyExpiry: dateOnlySchema.nullish(),
    notes: optionalText(1000),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one field to update',
  });

export const assignAssetSchema = z.object({
  employeeId: z.string().uuid('Select an employee'),
  expectedReturnAt: dateOnlySchema.optional(),
  issueCondition: optionalText(160),
  notes: optionalText(1000),
});

export const returnAssetSchema = z.object({
  returnCondition: optionalText(160),
  notes: optionalText(1000),
  // Where the asset lands after it comes back.
  status: z.enum(['AVAILABLE', 'IN_REPAIR', 'RETIRED', 'LOST']).default('AVAILABLE'),
});

export const myAssetsQuerySchema = paginationQuerySchema.pick({ page: true, limit: true });

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type CreateAssetBody = z.infer<typeof createAssetSchema>;
export type UpdateAssetBody = z.infer<typeof updateAssetSchema>;
export type AssignAssetBody = z.infer<typeof assignAssetSchema>;
export type ReturnAssetBody = z.infer<typeof returnAssetSchema>;
export type MyAssetsQuery = z.infer<typeof myAssetsQuerySchema>;
