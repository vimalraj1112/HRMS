import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { DashboardPayload } from '@/types/dashboard';

export async function getDashboard(): Promise<DashboardPayload> {
  const response = await api.get<ApiSuccess<DashboardPayload>>('/dashboard');
  return response.data.data;
}
