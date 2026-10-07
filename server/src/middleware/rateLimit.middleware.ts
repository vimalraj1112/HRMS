import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

function build(limit: number, message: string): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message, errors: [], meta: null },
  });
}

export const apiRateLimiter: RequestHandler = build(
  env.RATE_LIMIT_MAX,
  'Too many requests. Please try again later.',
);

export const authRateLimiter: RequestHandler = build(
  env.AUTH_RATE_LIMIT_MAX,
  'Too many authentication attempts. Please try again later.',
);
