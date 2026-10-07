import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { REFRESH_COOKIE_NAME } from '../../src/modules/auth/auth.types';

export const app = createApp();

export interface Credentials {
  email: string;
  password: string;
}

export const ACCOUNTS = {
  superAdmin: {
    email: env.SEED_SUPER_ADMIN_EMAIL,
    password: env.SEED_SUPER_ADMIN_PASSWORD,
  },
  hrAdmin: {
    email: env.SEED_HR_ADMIN_EMAIL,
    password: env.SEED_HR_ADMIN_PASSWORD,
  },
  hrManager: { email: 'hrmanager@superlink.local', password: env.SEED_DEFAULT_PASSWORD },
  recruiter: { email: 'recruiter@superlink.local', password: env.SEED_DEFAULT_PASSWORD },
  manager: { email: 'manager.eng@superlink.local', password: env.SEED_DEFAULT_PASSWORD },
  finance: { email: 'finance@superlink.local', password: env.SEED_DEFAULT_PASSWORD },
  employee: { email: 'ananya@superlink.local', password: env.SEED_DEFAULT_PASSWORD },
} satisfies Record<string, Credentials>;

export interface LoginResult {
  accessToken: string;
  refreshCookie: string;
  userId: string;
  employeeId: string | null;
}

export async function login(credentials: Credentials): Promise<LoginResult> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send(credentials)
    .expect(200);

  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = cookies?.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));

  if (!refreshCookie) throw new Error('Refresh cookie was not set on login');

  return {
    accessToken: response.body.data.tokens.accessToken as string,
    refreshCookie,
    userId: response.body.data.user.id as string,
    employeeId: (response.body.data.user.employee?.id ?? null) as string | null,
  };
}
