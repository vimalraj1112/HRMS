import { AuditAction, type Prisma, type SystemSetting } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import { recordAudit, redactForAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import type { Actor } from '../leave/leave.service';
import {
  SETTING_KEYS,
  SETTING_VALUE_SCHEMAS,
  type SettingKey,
  type UpdateSettingBody,
} from './settings.validator';

/**
 * The five core keys are readable by every signed in user (the app shows the
 * company name and currency) and can never be deleted, while everything else
 * stays visible only to settings managers and may be removed.
 */
const CORE_SETTING_KEYS = new Set<string>(SETTING_KEYS);

interface DefaultSetting {
  key: SettingKey;
  value: Prisma.InputJsonValue;
  description: string;
}

const DEFAULT_SETTINGS: DefaultSetting[] = [
  { key: 'companyName', value: 'Superlink', description: 'Legal name of the organisation' },
  { key: 'defaultCurrency', value: 'INR', description: 'Currency used for salaries and payroll' },
  { key: 'workingDaysPerWeek', value: 5, description: 'Working days expected each week' },
  { key: 'weekendDays', value: ['sat', 'sun'], description: 'Days treated as the weekly off' },
  { key: 'enableAnnouncements', value: true, description: 'Whether HR can publish announcements' },
];

export interface SettingView {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

function serialize(setting: SystemSetting): SettingView {
  return {
    key: setting.key,
    value: setting.value,
    description: setting.description,
    updatedAt: setting.updatedAt.toISOString(),
  };
}

function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

/** Settings are created on first read so a fresh install never 404s. */
async function ensureDefaults(): Promise<void> {
  const count = await prisma.systemSetting.count();
  if (count > 0) return;

  await prisma.systemSetting.createMany({ data: DEFAULT_SETTINGS, skipDuplicates: true });
}

export async function listSettings(actor: Actor): Promise<SettingView[]> {
  await ensureDefaults();

  const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  const canManage = hasPermission(actor.role, PERMISSIONS.SETTINGS_MANAGE);

  return settings
    .filter((setting) => canManage || CORE_SETTING_KEYS.has(setting.key))
    .map(serialize);
}

export async function getSetting(key: string, actor: Actor): Promise<SettingView> {
  await ensureDefaults();

  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) throw ApiError.notFound('Setting not found');

  if (!hasPermission(actor.role, PERMISSIONS.SETTINGS_MANAGE) && !CORE_SETTING_KEYS.has(key)) {
    throw ApiError.forbidden('You do not have permission to read this setting');
  }

  return serialize(setting);
}

export async function updateSetting(
  key: string,
  body: UpdateSettingBody,
  actor: Actor,
  meta: RequestMeta,
): Promise<SettingView> {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  const schema = isSettingKey(key) ? SETTING_VALUE_SCHEMAS[key] : undefined;

  if (!existing && !schema) throw ApiError.unprocessable(`Unknown setting "${key}"`);

  let value: Prisma.InputJsonValue;
  if (schema) {
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) {
      throw ApiError.unprocessable(
        'Invalid value for this setting',
        parsed.error.issues.map((issue) => ({ field: 'value', message: issue.message })),
      );
    }
    value = parsed.data as Prisma.InputJsonValue;
  } else {
    value = body.value as Prisma.InputJsonValue;
  }

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value, description: body.description, updatedById: actor.id },
    create: { key, value, description: body.description ?? null, updatedById: actor.id },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.SETTINGS_UPDATE,
    entity: 'SystemSetting',
    entityId: key,
    meta,
    oldValue: existing ? redactForAudit(existing.value) : null,
    newValue: redactForAudit(value),
  });

  return serialize(setting);
}

export async function deleteSetting(key: string, actor: Actor, meta: RequestMeta): Promise<{ key: string }> {
  if (CORE_SETTING_KEYS.has(key)) throw ApiError.unprocessable('This setting cannot be deleted');

  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) throw ApiError.notFound('Setting not found');

  await prisma.systemSetting.delete({ where: { key } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.SETTINGS_UPDATE,
    entity: 'SystemSetting',
    entityId: key,
    meta,
    oldValue: redactForAudit(existing.value),
  });

  return { key };
}
