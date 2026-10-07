import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError, type FieldError } from '../utils/ApiError';

interface NormalizedError {
  statusCode: number;
  message: string;
  errors: FieldError[];
  code?: string;
}

function fromPrisma(error: Prisma.PrismaClientKnownRequestError): NormalizedError {
  const target = error.meta?.['target'];
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];

  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        message: 'A record with these unique values already exists',
        errors: fields.map((field) => ({ field, message: `${field} must be unique` })),
        code: 'CONFLICT',
      };
    case 'P2003':
      return {
        statusCode: 422,
        message: 'Related record does not exist or is still in use',
        errors: [{ field: 'reference', message: 'Foreign key constraint failed' }],
        code: 'BUSINESS_RULE_VIOLATION',
      };
    case 'P2025':
      return { statusCode: 404, message: 'Resource not found', errors: [], code: 'NOT_FOUND' };
    default:
      return { statusCode: 400, message: 'Database request could not be completed', errors: [], code: error.code };
  }
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, message: error.message, errors: error.errors, code: error.code };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      message: 'Validation failed',
      errors: error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      })),
      code: 'VALIDATION_ERROR',
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrisma(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, message: 'Invalid database query payload', errors: [], code: 'VALIDATION_ERROR' };
  }

  if (error instanceof MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds the allowed limit' : `File upload failed: ${error.message}`;
    return { statusCode: 400, message, errors: [{ field: 'file', message }], code: error.code };
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return { statusCode: 400, message: 'Malformed JSON payload', errors: [], code: 'INVALID_JSON' };
  }

  if (typeof error === 'object' && error !== null && 'status' in error && 'message' in error) {
    const candidate = error as { status?: number; message?: string };
    const statusCode = typeof candidate.status === 'number' ? candidate.status : 500;
    if (statusCode === 401) return { statusCode, message: 'Authentication required', errors: [], code: 'UNAUTHENTICATED' };
    if (statusCode === 403) return { statusCode, message: 'You do not have permission to perform this action', errors: [], code: 'FORBIDDEN' };
    return { statusCode, message: candidate.message ?? 'Request failed', errors: [] };
  }

  return { statusCode: 500, message: 'An unexpected error occurred', errors: [], code: 'INTERNAL_ERROR' };
}

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const normalized = normalize(error);

  const logPayload = {
    err: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error,
    statusCode: normalized.statusCode,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    requestId: res.getHeader('x-request-id'),
  };

  if (normalized.statusCode >= 500) {
    logger.error(logPayload, 'Request failed');
  } else {
    logger.warn(logPayload, 'Request rejected');
  }

  const body: {
    success: false;
    message: string;
    errors: FieldError[];
    meta: null;
    stack?: string;
  } = {
    success: false,
    message: normalized.message,
    errors: normalized.errors,
    meta: null,
  };

  if (env.DEBUG_ERROR_STACK && error instanceof Error && error.stack) {
    body.stack = error.stack;
  }

  res.status(normalized.statusCode).json(body);
};
