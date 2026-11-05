import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { WeeklyTimesheetQuery, WeeklyTimesheetResult } from '@/types/timesheet';

export async function listWeeklyTimesheets(
  query: WeeklyTimesheetQuery = {},
): Promise<WeeklyTimesheetResult> {
  const response = await api.get<ApiSuccess<WeeklyTimesheetResult>>('/timesheets/week', {
    params: cleanQuery(query),
  });
  return response.data.data;
}
