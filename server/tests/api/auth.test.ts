import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

describe('POST /api/v1/auth/login', () => {
  it('signs in a valid user and returns tokens plus a refresh cookie', async () => {
    const response = await request(app).post('/api/v1/auth/login').send(ACCOUNTS.superAdmin).expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(ACCOUNTS.superAdmin.email);
    expect(response.body.data.user.role).toBe('SUPER_ADMIN');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof response.body.data.tokens.accessToken).toBe('string');
    expect(response.body.data.tokens.expiresIn).toBeGreaterThan(0);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('slhrms_rt='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
  });

  it('rejects a wrong password with a generic message', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ACCOUNTS.employee.email, password: 'WrongPassword@123' })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('does not reveal whether an email exists', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@superlink.local', password: 'WrongPassword@123' })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password');
  });

  it('returns a validation error for a malformed email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/auth/me', () => {
  let session: LoginResult;

  beforeAll(async () => {
    session = await login(ACCOUNTS.hrAdmin);
  });

  it('returns the current user for a valid access token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body.data.email).toBe(ACCOUNTS.hrAdmin.email);
    expect(response.body.data.role).toBe('HR_ADMIN');
  });

  it('rejects a missing token', async () => {
    const response = await request(app).get('/api/v1/auth/me').expect(401);
    expect(response.body.success).toBe(false);
  });

  it('rejects a forged token', async () => {
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });

  it('rejects a tampered signature', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send(ACCOUNTS.manager).expect(200);
    const accessToken = loginResponse.body.data.tokens.accessToken as string;
    const [header, payload] = accessToken.split('.');
    const tampered = `${header as string}.${payload as string}.deadbeef`;

    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`).expect(401);
  });

  it('rejects a token signed with the refresh secret', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send(ACCOUNTS.manager).expect(200);
    const accessToken = loginResponse.body.data.tokens.accessToken as string;
    const [, payload] = accessToken.split('.');

    const decoded = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8')) as Record<string, unknown>;
    const forged = jwt.sign(decoded, env.JWT_REFRESH_SECRET);

    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  let session: LoginResult;

  beforeAll(async () => {
    session = await login(ACCOUNTS.manager);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);

    const newAccessToken = response.body.data.tokens.accessToken as string;
    expect(newAccessToken).not.toBe(session.accessToken);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const rotated = cookies.find((cookie) => cookie.startsWith('slhrms_rt='));
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(session.refreshCookie);
  });

  it('rejects reuse of a rotated refresh token', async () => {
    const first = await login(ACCOUNTS.employee);
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', first.refreshCookie)
      .expect(200);

    const rotatedCookie = (rotated.headers['set-cookie'] as unknown as string[]).find((cookie) =>
      cookie.startsWith('slhrms_rt='),
    );

    await request(app).post('/api/v1/auth/refresh').set('Cookie', first.refreshCookie).expect(401);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedCookie as string).expect(401);
  });

  it('rejects an absent or malformed refresh cookie', async () => {
    await request(app).post('/api/v1/auth/refresh').expect(401);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', 'slhrms_rt=garbage').expect(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const session = await login(ACCOUNTS.employee);

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Cookie', session.refreshCookie)
      .expect(200);

    expect(response.body.success).toBe(true);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  it('revokes every active session for the user', async () => {
    const credentials = ACCOUNTS.employee;
    const first = await login(credentials);
    const second = await login(credentials);

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .set('Cookie', second.refreshCookie)
      .expect(200);

    await request(app).post('/api/v1/auth/refresh').set('Cookie', second.refreshCookie).expect(401);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', first.refreshCookie).expect(401);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  it('rejects an incorrect current password', async () => {
    const session = await login(ACCOUNTS.employee);

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: 'WrongPassword@123',
        newPassword: 'BrandNewPass@456',
        confirmPassword: 'BrandNewPass@456',
      })
      .expect(401);

    expect(response.body.success).toBe(false);
  });

  it('rejects reusing the current password', async () => {
    const session = await login(ACCOUNTS.employee);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: ACCOUNTS.employee.password,
        newPassword: ACCOUNTS.employee.password,
        confirmPassword: ACCOUNTS.employee.password,
      })
      .expect(400);
  });

  it('rejects a mismatched confirmation', async () => {
    const session = await login(ACCOUNTS.employee);

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: ACCOUNTS.employee.password,
        newPassword: 'BrandNewPass@456',
        confirmPassword: 'BrandNewPass@789',
      })
      .expect(400);

    expect(
      (
        response.body.errors as { field: string; message: string }[]
      ).some((error) => error.field === 'confirmPassword'),
    ).toBe(true);
  });

  it('enforces the password policy', async () => {
    const session = await login(ACCOUNTS.employee);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: ACCOUNTS.employee.password, newPassword: 'weak', confirmPassword: 'weak' })
      .expect(400);
  });

  it('changes the password and invalidates the current session', async () => {
    const original = ACCOUNTS.employee;
    const nextPassword = 'RotatedPass@2026';

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${(await login(original)).accessToken}`)
      .send({ currentPassword: original.password, newPassword: nextPassword, confirmPassword: nextPassword })
      .expect(200);

    expect(changed.body.success).toBe(true);
    await request(app).post('/api/v1/auth/login').send({ email: original.email, password: original.password }).expect(401);

    const signIn = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: original.email, password: nextPassword })
      .expect(200);

    expect(signIn.body.data.user.mustChangePassword).toBe(false);

    // Restore the seeded password so the suite stays order-independent.
    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${signIn.body.data.tokens.accessToken as string}`)
      .send({ currentPassword: nextPassword, newPassword: original.password, confirmPassword: original.password })
      .expect(200);
  });
});
