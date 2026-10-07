import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '../../config/env';
import { getRequestMeta } from '../../services/audit.service';
import { sendSuccess } from '../../utils/apiResponse';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, type AuthSession } from './auth.types';
import * as authService from './auth.service';
import type { ChangePasswordBody, LoginBody } from './auth.validator';

function cookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME];
}

function startSession(res: Response, session: AuthSession, message: string) {
  res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, cookieOptions(session.refreshTokenExpiresAt));
  return sendSuccess(
    res,
    { user: session.user, tokens: session.tokens },
    message,
  );
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const session = await authService.login(req.validated?.body as LoginBody, getRequestMeta(req));
  startSession(res, session, 'Signed in successfully');
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  const session = await authService.rotateRefreshToken(readRefreshCookie(req), getRequestMeta(req));
  startSession(res, session, 'Session refreshed');
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  await authService.logout(req.user?.id ?? '', readRefreshCookie(req), getRequestMeta(req));
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  sendSuccess(res, null, 'Signed out successfully');
}

export async function logoutAllController(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(req.user?.id ?? '', getRequestMeta(req));
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  sendSuccess(res, null, 'Signed out from all devices');
}

export async function meController(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(req.user?.id ?? '');
  sendSuccess(res, user, 'Current user');
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  await authService.changePassword(
    req.user?.id ?? '',
    req.validated?.body as ChangePasswordBody,
    getRequestMeta(req),
  );
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  sendSuccess(res, null, 'Password changed. Please sign in again.');
}
