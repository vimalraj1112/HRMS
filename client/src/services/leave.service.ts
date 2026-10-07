import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type {
  ApplyLeavePayload,
  LeaveBalance,
  LeaveBalanceAdjustment,
  LeaveDecisionPayload,
  LeaveListQuery,
  LeaveRequest,
  LeaveType,
  LeaveTypePayload,
} from '@/types/time';
import type { SortOrder } from '@/types/hr';
import type { Page } from './employee.service';

export async function listLeaveRequests(query: LeaveListQuery = {}): Promise<Page<LeaveRequest>> {
  const response = await api.get<ApiSuccess<LeaveRequest[]>>('/leaves', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<LeaveRequest>['meta'] };
}

export async function listMyLeaveRequests(query: LeaveListQuery = {}): Promise<Page<LeaveRequest>> {
  const response = await api.get<ApiSuccess<LeaveRequest[]>>('/leaves/my', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<LeaveRequest>['meta'] };
}

export async function listApprovals(query: LeaveListQuery = {}): Promise<Page<LeaveRequest>> {
  const response = await api.get<ApiSuccess<LeaveRequest[]>>('/leaves/approvals', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<LeaveRequest>['meta'] };
}

export async function getLeaveRequest(id: string): Promise<LeaveRequest> {
  const response = await api.get<ApiSuccess<LeaveRequest>>(`/leaves/${id}`);
  return response.data.data;
}

export async function applyLeave(payload: ApplyLeavePayload): Promise<LeaveRequest> {
  const response = await api.post<ApiSuccess<LeaveRequest>>('/leaves', payload);
  return response.data.data;
}

export async function decideLeaveRequest(id: string, payload: LeaveDecisionPayload): Promise<LeaveRequest> {
  const response = await api.post<ApiSuccess<LeaveRequest>>(`/leaves/${id}/decision`, payload);
  return response.data.data;
}

export async function cancelLeaveRequest(id: string, reason: string): Promise<LeaveRequest> {
  const response = await api.post<ApiSuccess<LeaveRequest>>(`/leaves/${id}/cancel`, { reason });
  return response.data.data;
}

export async function myLeaveBalances(year?: string): Promise<{ items: LeaveBalance[]; year: number | null }> {
  const response = await api.get<ApiSuccess<{ items: LeaveBalance[]; year: number | null }>>('/leave-balances/me', {
    params: cleanQuery({ year }),
  });
  return response.data.data;
}

export async function employeeLeaveBalances(employeeId: string, year?: string) {
  const response = await api.get<
    ApiSuccess<{
      employee: { id: string; employeeCode: string; firstName: string; lastName: string };
      year: number;
      items: LeaveBalance[];
    }>
  >(`/leave-balances/${employeeId}`, { params: cleanQuery({ year }) });
  return response.data.data;
}

export async function adjustLeaveBalance(id: string, body: LeaveBalanceAdjustment): Promise<LeaveBalance> {
  const response = await api.patch<ApiSuccess<LeaveBalance>>(`/leave-balances/${id}`, body);
  return response.data.data;
}

export interface RolloverResult {
  fromYear: number;
  toYear: number;
  employees: number;
  leaveTypes: number;
  created: number;
  kept: number;
  carried: Array<{ employeeId: string; leaveTypeId: string; leaveTypeName: string; amount: number }>;
}

export async function rolloverLeaveBalances(fromYear: number, toYear: number): Promise<RolloverResult> {
  const response = await api.post<ApiSuccess<RolloverResult>>('/leave-balances/rollover', undefined, {
    params: { fromYear, toYear },
  });
  return response.data.data;
}

export async function listLeaveTypes(
  query: { page?: number; limit?: number; search?: string; includeInactive?: boolean; sortBy?: string; sortOrder?: SortOrder } = {},
): Promise<Page<LeaveType>> {
  const response = await api.get<ApiSuccess<LeaveType[]>>('/leave-types', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<LeaveType>['meta'] };
}

export async function createLeaveType(payload: LeaveTypePayload): Promise<LeaveType> {
  const response = await api.post<ApiSuccess<LeaveType>>('/leave-types', payload);
  return response.data.data;
}

export async function updateLeaveType(id: string, payload: Partial<LeaveTypePayload>): Promise<LeaveType> {
  const response = await api.patch<ApiSuccess<LeaveType>>(`/leave-types/${id}`, payload);
  return response.data.data;
}

export async function deleteLeaveType(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/leave-types/${id}`);
  return response.data.data;
}
