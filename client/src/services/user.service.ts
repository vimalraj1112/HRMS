import { api, cleanQuery } from '@/lib/api';
import type { Page } from '@/services/employee.service';
import type { ApiMeta, ApiSuccess, Role } from '@/types/api';
import type {
  CreateUserPayload,
  CreatedUser,
  ResetPasswordPayload,
  ResetPasswordResult,
  UpdateUserStatusPayload,
  UserAccount,
  UserListQuery,
  UserStatus,
} from '@/types/user';

export async function listUsers(query: UserListQuery = {}): Promise<Page<UserAccount>> {
  const response = await api.get<ApiSuccess<UserAccount[]>>('/users', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getUser(id: string): Promise<UserAccount> {
  const response = await api.get<ApiSuccess<UserAccount>>(`/users/${id}`);
  return response.data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<CreatedUser> {
  const response = await api.post<ApiSuccess<CreatedUser>>('/users', payload);
  return response.data.data;
}

export async function updateUserRole(id: string, role: Role): Promise<{ id: string; email: string; role: Role; status: UserStatus }> {
  const response = await api.patch<ApiSuccess<{ id: string; email: string; role: Role; status: UserStatus }>>(
    `/users/${id}/role`,
    { role },
  );
  return response.data.data;
}

export async function updateUserStatus(id: string, payload: UpdateUserStatusPayload): Promise<{ id: string; status: UserStatus }> {
  const response = await api.patch<ApiSuccess<{ id: string; status: UserStatus }>>(`/users/${id}/status`, payload);
  return response.data.data;
}

export async function resetUserPassword(id: string, payload: ResetPasswordPayload = {}): Promise<ResetPasswordResult> {
  const response = await api.post<ApiSuccess<ResetPasswordResult>>(`/users/${id}/reset-password`, payload);
  return response.data.data;
}
