import type { Response } from 'express';
import type { FieldError } from './ApiError';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
  meta: PaginationMeta | Record<string, unknown> | null;
}

export interface ErrorBody {
  success: false;
  message: string;
  errors: FieldError[];
  meta: null;
}

export function sendSuccess<T>(res: Response, data: T, message = 'Request successful', statusCode = 200): Response {
  const body: SuccessBody<T> = { success: true, message, data, meta: null };
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T, message = 'Created successfully'): Response {
  return sendSuccess(res, data, message, 201);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  message = 'Request successful',
  extraMeta?: Record<string, unknown>,
): Response {
  const body: SuccessBody<T[]> = {
    success: true,
    message,
    data,
    meta: extraMeta ? { ...meta, ...extraMeta } : meta,
  };
  return res.status(200).json(body);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
