import type { ParamsDictionary } from 'express';
import type { AuthEmployeeContext, AuthUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      user?: AuthUser;
      authEmployee?: AuthEmployeeContext | null;
    }
  }
}

export type ValidatedRequest<TBody = unknown, TQuery = unknown, TParams = unknown> = Request<
  ParamsDictionary,
  unknown,
  TBody,
  TQuery,
  TParams
>;

export {};
