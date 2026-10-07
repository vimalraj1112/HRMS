import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { Setting, UpdateSettingPayload } from '@/types/settings';

const SETTINGS_PATH = '/settings';

export async function listSettings(): Promise<Setting[]> {
  const response = await api.get<ApiSuccess<Setting[]>>(SETTINGS_PATH);
  return response.data.data;
}

export async function getSetting(key: string): Promise<Setting> {
  const response = await api.get<ApiSuccess<Setting>>(`${SETTINGS_PATH}/${key}`);
  return response.data.data;
}

export async function updateSetting(key: string, payload: UpdateSettingPayload): Promise<Setting> {
  const response = await api.put<ApiSuccess<Setting>>(`${SETTINGS_PATH}/${key}`, payload);
  return response.data.data;
}

export async function deleteSetting(key: string): Promise<{ key: string }> {
  const response = await api.delete<ApiSuccess<{ key: string }>>(`${SETTINGS_PATH}/${key}`);
  return response.data.data;
}
