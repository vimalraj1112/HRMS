import type { Request } from 'express';
import type { ZodType } from 'zod';

export function getBody<T>(req: Request): T {
  return (req.validated?.body ?? req.body) as T;
}

export function getQuery<T>(req: Request): T {
  return (req.validated?.query ?? req.query) as T;
}

export function getParams<T>(req: Request): T {
  return (req.validated?.params ?? req.params) as T;
}

export function isSchema(value: unknown): value is ZodType {
  return typeof value === 'object' && value !== null && 'safeParse' in value;
}
