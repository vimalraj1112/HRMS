import { describe, expect, it } from 'vitest';
import { ApiError } from '@/utils/ApiError';
import { buildPaginationMeta } from '@/utils/apiResponse';
import { paginationQuerySchema, emailSchema, passwordSchema, dateOnlySchema } from '@/validators/common.validator';

describe('ApiError', () => {
  it('exposes the correct HTTP status for each factory', () => {
    expect(ApiError.badRequest('bad').statusCode).toBe(400);
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound().statusCode).toBe(404);
    expect(ApiError.conflict('exists').statusCode).toBe(409);
    expect(ApiError.unprocessable('rule').statusCode).toBe(422);
    expect(ApiError.tooManyRequests().statusCode).toBe(429);
    expect(ApiError.internal().statusCode).toBe(500);
  });

  it('is flagged as an operational error', () => {
    expect(ApiError.forbidden().isOperational).toBe(true);
  });
});

describe('buildPaginationMeta', () => {
  it('computes totals and navigation flags', () => {
    const meta = buildPaginationMeta(2, 20, 95);
    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 95,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('handles an empty result set', () => {
    const meta = buildPaginationMeta(1, 20, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });
});

describe('common validators', () => {
  it('applies pagination defaults', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toMatchObject({ page: 1, limit: 20, sortOrder: 'desc' });
  });

  it('rejects a page size above the maximum', () => {
    expect(paginationQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('normalises emails to lowercase', () => {
    expect(emailSchema.parse('  HR.Admin@SuperLink.Local ')).toBe('hr.admin@superlink.local');
  });

  it('requires a strong password', () => {
    expect(passwordSchema.safeParse('weakpass').success).toBe(false);
    expect(passwordSchema.safeParse('StrongPass1').success).toBe(true);
  });

  it('accepts only real calendar dates', () => {
    expect(dateOnlySchema.safeParse('2026-02-30').success).toBe(false);
    expect(dateOnlySchema.safeParse('2026-02-28').success).toBe(true);
  });
});
