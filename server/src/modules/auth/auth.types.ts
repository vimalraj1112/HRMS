import type { Role } from '@prisma/client';

export interface AuthEmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
}

export interface AuthUserPayload {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  employee: AuthEmployeeSummary | null;
}

export interface AuthTokensPayload {
  accessToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: AuthUserPayload;
  tokens: AuthTokensPayload;
}

/** Internal session returned by the service. The refresh token is only ever placed in an httpOnly cookie. */
export interface AuthSession extends AuthResult {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export const REFRESH_COOKIE_NAME = 'slhrms_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
