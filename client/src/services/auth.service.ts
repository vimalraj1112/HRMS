import { api } from '@/lib/api';
import type { ApiSuccess, AuthTokens, AuthUser } from '@/types/api';

export interface AuthSessionResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function loginRequest(email: string, password: string): Promise<AuthSessionResponse> {
  const response = await api.post<ApiSuccess<AuthSessionResponse>>('/auth/login', { email, password });
  return response.data.data;
}

export async function meRequest(): Promise<AuthUser> {
  const response = await api.get<ApiSuccess<AuthUser>>('/auth/me');
  return response.data.data;
}

export async function logoutRequest(): Promise<void> {
  await api.post('/auth/logout');
}

export async function logoutAllRequest(): Promise<void> {
  await api.post('/auth/logout-all');
}

export async function changePasswordRequest(input: ChangePasswordInput): Promise<void> {
  await api.post('/auth/change-password', input);
}
