import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, useAuthStore } from '@/stores/auth.store';
import type { ApiFailure, AuthUser } from '@/types/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly errors: { field: string; message: string }[];
  readonly isNetworkError: boolean;

  constructor(message: string, status: number, errors: { field: string; message: string }[] = [], isNetworkError = false) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

interface RefreshPayload {
  user: AuthUser;
  tokens: { accessToken: string; expiresIn: number };
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await axios.post<{ data: RefreshPayload }>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true, timeout: 15_000 },
    );

    const session = response.data.data;
    useAuthStore.getState().setSession({ user: session.user, accessToken: session.tokens.accessToken });
    return session.tokens.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailure>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }

    return Promise.reject(await toApiError(error));
  },
);

/**
 * A failed download returns its JSON error inside a Blob, so that must be
 * unwrapped before the shared error mapping can read the message.
 */
async function toApiError(error: unknown): Promise<ApiRequestError> {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;
    const response = axiosError.response;
    if (response?.data instanceof Blob) {
      const text = await response.data.text().catch(() => '');
      try {
        response.data = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        response.data = null;
      }
    }
  }
  return normalizeError(error);
}

export function toMessage(error: unknown): string {
  return normalizeError(error).message;
}

/** Drops empty query values so filters are never sent as blank strings. */
export function cleanQuery<T extends object>(params: T): Record<string, string | number | boolean> {
  const cleaned: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value as string | number | boolean;
  }

  return cleaned;
}

export function normalizeError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiFailure>;
    const status = axiosError.response?.status ?? 0;
    const body = axiosError.response?.data;

    if (!axiosError.response) {
      return new ApiRequestError('Cannot reach the server. Check your connection and try again.', 0, [], true);
    }

    return new ApiRequestError(
      body?.message ?? axiosError.message ?? 'Request failed',
      status,
      body?.errors ?? [],
    );
  }

  if (error instanceof Error) return new ApiRequestError(error.message, 500);

  return new ApiRequestError('Something went wrong', 500);
}
