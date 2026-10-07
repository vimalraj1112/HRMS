export const SETTING_KEYS = [
  'companyName',
  'defaultCurrency',
  'workingDaysPerWeek',
  'weekendDays',
  'enableAnnouncements',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const WEEKEND_DAY_OPTIONS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type WeekendDay = (typeof WEEKEND_DAY_OPTIONS)[number];

export interface Setting {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

export interface UpdateSettingPayload {
  value: unknown;
  description?: string;
}
