import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { Department, DepartmentPayload, Designation, DesignationPayload, OrgListQuery } from '@/types/hr';
import type { Page } from './employee.service';

export async function listDepartments(query: OrgListQuery = {}): Promise<Page<Department>> {
  const response = await api.get<ApiSuccess<Department[]>>('/departments', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<Department>['meta'] };
}

export async function getDepartment(id: string): Promise<Department> {
  const response = await api.get<ApiSuccess<Department>>(`/departments/${id}`);
  return response.data.data;
}

export async function createDepartment(payload: DepartmentPayload): Promise<Department> {
  const response = await api.post<ApiSuccess<Department>>('/departments', payload);
  return response.data.data;
}

export async function updateDepartment(id: string, payload: Partial<DepartmentPayload>): Promise<Department> {
  const response = await api.patch<ApiSuccess<Department>>(`/departments/${id}`, payload);
  return response.data.data;
}

export async function deleteDepartment(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/departments/${id}`);
  return response.data.data;
}

export async function listDesignations(query: OrgListQuery = {}): Promise<Page<Designation>> {
  const response = await api.get<ApiSuccess<Designation[]>>('/designations', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<Designation>['meta'] };
}

export async function createDesignation(payload: DesignationPayload): Promise<Designation> {
  const response = await api.post<ApiSuccess<Designation>>('/designations', payload);
  return response.data.data;
}

export async function updateDesignation(id: string, payload: Partial<DesignationPayload>): Promise<Designation> {
  const response = await api.patch<ApiSuccess<Designation>>(`/designations/${id}`, payload);
  return response.data.data;
}

export async function deleteDesignation(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/designations/${id}`);
  return response.data.data;
}
