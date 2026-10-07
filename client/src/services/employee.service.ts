import { api, cleanQuery } from '@/lib/api';
import type { ApiMeta, ApiSuccess } from '@/types/api';
import type {
  EmployeeDetail,
  EmployeeListQuery,
  EmployeePayload,
  EmployeeStatus,
  EmployeeSummary,
  EmployeeUpdatePayload,
  StatusChangePayload,
} from '@/types/hr';

export interface Page<T> {
  items: T[];
  meta: ApiMeta;
}

export async function listEmployees(query: EmployeeListQuery = {}): Promise<Page<EmployeeSummary>> {
  const response = await api.get<ApiSuccess<EmployeeSummary[]>>('/employees', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getEmployee(id: string): Promise<EmployeeDetail> {
  const response = await api.get<ApiSuccess<EmployeeDetail>>(`/employees/${id}`);
  return response.data.data;
}

export async function createEmployee(payload: EmployeePayload): Promise<EmployeeDetail> {
  const response = await api.post<ApiSuccess<EmployeeDetail>>('/employees', payload);
  return response.data.data;
}

export async function updateEmployee(id: string, payload: EmployeeUpdatePayload): Promise<EmployeeDetail> {
  const response = await api.patch<ApiSuccess<EmployeeDetail>>(`/employees/${id}`, payload);
  return response.data.data;
}

export async function changeEmployeeStatus(id: string, payload: StatusChangePayload): Promise<{ id: string; status: EmployeeStatus }> {
  const response = await api.patch<ApiSuccess<{ id: string; status: EmployeeStatus }>>(`/employees/${id}/status`, payload);
  return response.data.data;
}

export async function deleteEmployee(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/employees/${id}`);
  return response.data.data;
}
