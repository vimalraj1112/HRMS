import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { Holiday, HolidayListQuery, HolidayPayload } from '@/types/time';
import type { Page } from './employee.service';

export async function listHolidays(query: HolidayListQuery = {}): Promise<Page<Holiday>> {
  const response = await api.get<ApiSuccess<Holiday[]>>('/holidays', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<Holiday>['meta'] };
}

export async function createHoliday(payload: HolidayPayload): Promise<Holiday> {
  const response = await api.post<ApiSuccess<Holiday>>('/holidays', payload);
  return response.data.data;
}

export async function updateHoliday(id: string, payload: Partial<HolidayPayload>): Promise<Holiday> {
  const response = await api.patch<ApiSuccess<Holiday>>(`/holidays/${id}`, payload);
  return response.data.data;
}

export async function deleteHoliday(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/holidays/${id}`);
  return response.data.data;
}
