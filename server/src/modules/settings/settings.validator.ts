import { z } from 'zod';

export const SETTING_KEYS = [
  'companyName',
  'defaultCurrency',
  'workingDaysPerWeek',
  'weekendDays',
  'enableAnnouncements',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const settingKeyParamSchema = z.object({
  key: z.string().trim().min(1, 'Setting key is required').max(80),
});

export const companyNameValueSchema = z.string().trim().min(2, 'Company name is too short').max(160);

export const currencyValueSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3 letter ISO code');

export const workingDaysValueSchema = z.number().int().min(1).max(7);

export const weekendDaysValueSchema = z
  .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
  .min(1, 'Pick at least one weekend day')
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'Weekend days must be unique');

export const announcementsValueSchema = z.boolean();

export const SETTING_VALUE_SCHEMAS: Record<SettingKey, z.ZodType> = {
  companyName: companyNameValueSchema,
  defaultCurrency: currencyValueSchema,
  workingDaysPerWeek: workingDaysValueSchema,
  weekendDays: weekendDaysValueSchema,
  enableAnnouncements: announcementsValueSchema,
};

/**
 * The payload carries an untyped `value`; each known key narrows it in the
 * service, and the refine stops a missing or null value reaching Prisma's
 * required Json column.
 */
export const updateSettingSchema = z
  .object({
    value: z.unknown().optional(),
    description: z.string().trim().max(255).optional(),
  })
  .refine((body) => body.value !== undefined && body.value !== null, {
    message: 'value is required',
    path: ['value'],
  });

export type UpdateSettingBody = z.infer<typeof updateSettingSchema>;
