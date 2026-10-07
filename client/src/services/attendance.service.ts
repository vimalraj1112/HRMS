import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type {
  AttendanceCorrectionPayload,
  AttendanceListQuery,
  AttendancePayload,
  AttendanceRecord,
  AttendanceSummaryQuery,
  AttendanceSummaryRow,
} from '@/types/time';
import type { Page } from './employee.service';

export type AttendanceScope = 'my' | 'team' | 'all';

const PATHS: Record<AttendanceScope, string> = {
  my: '/attendance/my',
  team: '/attendance/team',
  all: '/attendance',
};

export async function listAttendance(
  scope: AttendanceScope,
  query: AttendanceListQuery = {},
): Promise<Page<AttendanceRecord>> {
  const response = await api.get<ApiSuccess<AttendanceRecord[]>>(PATHS[scope], { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<AttendanceRecord>['meta'] };
}

export async function attendanceSummary(query: AttendanceSummaryQuery): Promise<Page<AttendanceSummaryRow>> {
  const response = await api.get<ApiSuccess<AttendanceSummaryRow[]>>('/attendance/summary', {
    params: cleanQuery(query),
  });
  return { items: response.data.data, meta: response.data.meta as Page<AttendanceSummaryRow>['meta'] };
}

export async function markAttendance(payload: AttendancePayload): Promise<AttendanceRecord> {
  const response = await api.post<ApiSuccess<AttendanceRecord>>('/attendance', payload);
  return response.data.data;
}

export async function correctAttendance(id: string, payload: AttendanceCorrectionPayload): Promise<AttendanceRecord> {
  const response = await api.patch<ApiSuccess<AttendanceRecord>>(`/attendance/${id}`, payload);
  return response.data.data;
}
