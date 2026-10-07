import type { RequestHandler } from 'express';
import { ApiError, type FieldError } from '../utils/ApiError';
import type { ZodType } from 'zod';

type ValidatedKey = 'body' | 'query' | 'params';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toFieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }, source: ValidatedKey): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map(String).join('.') : source,
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const fieldErrors: FieldError[] = [];

    for (const key of ['body', 'query', 'params'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        fieldErrors.push(...toFieldErrors(result.error, key));
        continue;
      }

      req.validated = { ...req.validated, [key]: result.data };

      if (key === 'body') req.body = result.data;
      if (key === 'params') req.params = result.data as typeof req.params;
    }

    if (fieldErrors.length > 0) {
      next(ApiError.badRequest('Validation failed', fieldErrors));
      return;
    }

    next();
  };
}
