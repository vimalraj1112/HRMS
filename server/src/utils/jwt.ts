import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';
import type { JwtAccessPayload, JwtRefreshPayload } from '../types/auth';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * multiplier;
}

export function accessTokenTtlSeconds(): number {
  return ttlToSeconds(env.JWT_ACCESS_TTL);
}

export function refreshTokenTtlSeconds(): number {
  return ttlToSeconds(env.JWT_REFRESH_TTL);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueTokens(user: {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
  tokenVersion: number;
}): IssuedTokens {
  const sessionId = randomUUID();
  const accessExpiresIn = accessTokenTtlSeconds();
  const accessTtl = env.JWT_ACCESS_TTL as SignOptions['expiresIn'];
  const refreshTtl = env.JWT_REFRESH_TTL as SignOptions['expiresIn'];

  const accessPayload: JwtAccessPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    tokenVersion: user.tokenVersion,
    jti: randomUUID(),
    type: 'access',
  };

  const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {
    expiresIn: accessTtl,
    issuer: 'superlink-hrms',
    audience: 'superlink-hrms-web',
  } satisfies SignOptions);

  const refreshPayload: JwtRefreshPayload = { sub: user.id, sessionId, type: 'refresh' };
  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: refreshTtl,
    issuer: 'superlink-hrms',
    audience: 'superlink-hrms-web',
  } satisfies SignOptions);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: accessExpiresIn,
    refreshTokenExpiresAt: new Date(Date.now() + refreshTokenTtlSeconds() * 1000),
    sessionId,
  };
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'superlink-hrms',
      audience: 'superlink-hrms-web',
    }) as JwtAccessPayload;

    if (decoded.type !== 'access') throw ApiError.unauthorized('Invalid token type');
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Access token is invalid or has expired');
  }
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'superlink-hrms',
      audience: 'superlink-hrms-web',
    }) as JwtRefreshPayload;

    if (decoded.type !== 'refresh') throw ApiError.unauthorized('Invalid token type');
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Refresh token is invalid or has expired');
  }
}
