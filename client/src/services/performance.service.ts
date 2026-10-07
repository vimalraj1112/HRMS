import { api, cleanQuery } from '@/lib/api';
import type { ApiMeta, ApiSuccess } from '@/types/api';
import type {
  Goal,
  GoalListQuery,
  GoalPatch,
  GoalPayload,
  PerformanceReview,
  ReviewListQuery,
  ReviewPatch,
  ReviewPayload,
} from '@/types/performance';
import type { Page } from './employee.service';

export async function listGoals(query: GoalListQuery = {}): Promise<Page<Goal>> {
  const response = await api.get<ApiSuccess<Goal[]>>('/performance/goals', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getGoal(id: string): Promise<Goal> {
  const response = await api.get<ApiSuccess<Goal>>(`/performance/goals/${id}`);
  return response.data.data;
}

export async function createGoal(payload: GoalPayload): Promise<Goal> {
  const response = await api.post<ApiSuccess<Goal>>('/performance/goals', payload);
  return response.data.data;
}

export async function updateGoal(id: string, payload: GoalPatch): Promise<Goal> {
  const response = await api.patch<ApiSuccess<Goal>>(`/performance/goals/${id}`, payload);
  return response.data.data;
}

export async function deleteGoal(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/performance/goals/${id}`);
  return response.data.data;
}

export async function listReviews(query: ReviewListQuery = {}): Promise<Page<PerformanceReview>> {
  const response = await api.get<ApiSuccess<PerformanceReview[]>>('/performance/reviews', {
    params: cleanQuery(query),
  });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getReview(id: string): Promise<PerformanceReview> {
  const response = await api.get<ApiSuccess<PerformanceReview>>(`/performance/reviews/${id}`);
  return response.data.data;
}

export async function createReview(payload: ReviewPayload): Promise<PerformanceReview> {
  const response = await api.post<ApiSuccess<PerformanceReview>>('/performance/reviews', payload);
  return response.data.data;
}

export async function updateReview(id: string, payload: ReviewPatch): Promise<PerformanceReview> {
  const response = await api.patch<ApiSuccess<PerformanceReview>>(`/performance/reviews/${id}`, payload);
  return response.data.data;
}

export async function submitReview(
  id: string,
  payload: { managerRating?: number; managerComments?: string },
): Promise<PerformanceReview> {
  const response = await api.post<ApiSuccess<PerformanceReview>>(`/performance/reviews/${id}/submit`, payload);
  return response.data.data;
}

export async function acknowledgeReview(
  id: string,
  payload: { employeeComments?: string },
): Promise<PerformanceReview> {
  const response = await api.post<ApiSuccess<PerformanceReview>>(
    `/performance/reviews/${id}/acknowledge`,
    payload,
  );
  return response.data.data;
}
