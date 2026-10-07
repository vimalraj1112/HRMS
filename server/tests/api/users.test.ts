import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

describe('GET /api/v1/users', () => {
  let superAdmin: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
    employee = await login(ACCOUNTS.employee);
  });

  it('denies anonymous access', async () => {
    await request(app).get('/api/v1/users').expect(401);
  });

  it('denies users without the user:read permission', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('returns a paginated list for an administrator', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .query({ page: 1, limit: 5 })
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 5, total: expect.any(Number) });
    expect(response.body.data[0]).not.toHaveProperty('passwordHash');
  });

  it('filters by role and search term', async () => {
    const response = await request(app)
      .get('/api/v1/users')
      .query({ role: 'EMPLOYEE', search: 'ananya' })
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const user of response.body.data as { role: string; email: string }[]) {
      expect(user.role).toBe('EMPLOYEE');
      expect(user.email).toContain('ananya');
    }
  });

  it('validates query parameters', async () => {
    await request(app)
      .get('/api/v1/users')
      .query({ role: 'GOD_MODE' })
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(400);
  });

  it('rejects a malformed id', async () => {
    await request(app)
      .get('/api/v1/users/not-a-uuid')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(400);
  });

  it('returns 404 for an unknown user', async () => {
    await request(app)
      .get('/api/v1/users/9f1c4d2e-2b3a-4c5d-8e7f-0a1b2c3d4e5f')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(404);
  });
});

describe('POST /api/v1/users', () => {
  let superAdmin: LoginResult;
  const created: string[] = [];

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
  });

  const createUser = (overrides: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ email: 'temp.user@superlink.local', password: 'TempPass@1234', role: 'EMPLOYEE', ...overrides });

  it('creates a user that must change the password at first sign-in', async () => {
    const response = await createUser().expect(201);

    expect(response.body.data.email).toBe('temp.user@superlink.local');
    expect(response.body.data.mustChangePassword).toBe(true);
    expect(response.body.data).not.toHaveProperty('passwordHash');
    created.push(response.body.data.id as string);
  });

  it('rejects a duplicate email', async () => {
    const response = await createUser().expect(409);
    expect(response.body.success).toBe(false);
  });

  it('enforces the password policy', async () => {
    await createUser({ email: 'weak.user@superlink.local', password: '123' }).expect(400);
  });

  it('rejects an unknown role', async () => {
    await createUser({ email: 'role.user@superlink.local', role: 'ROOT' }).expect(400);
  });

  it('is denied for employees', async () => {
    const employee = await login(ACCOUNTS.employee);
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ email: 'nope.user@superlink.local', password: 'TempPass@1234', role: 'EMPLOYEE' })
      .expect(403);
  });

  it('leaves the created user able to sign in', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'temp.user@superlink.local', password: 'TempPass@1234' })
      .expect(200);

    expect(response.body.data.user.mustChangePassword).toBe(true);
  });
});

describe('PATCH /api/v1/users/:id/role', () => {
  let superAdmin: LoginResult;

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
  });

  it('changes a role', async () => {
    const target = await login(ACCOUNTS.recruiter);
    const response = await request(app)
      .patch(`/api/v1/users/${target.userId}/role`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ role: 'MANAGER' })
      .expect(200);

    expect(response.body.data.role).toBe('MANAGER');

    // The recruiter account is shared with other suites: put the role back.
    await request(app)
      .patch(`/api/v1/users/${target.userId}/role`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ role: 'RECRUITER' })
      .expect(200);
  });

  it('prevents an administrator from changing their own role', async () => {
    await request(app)
      .patch(`/api/v1/users/${superAdmin.userId}/role`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ role: 'EMPLOYEE' })
      .expect(422);
  });

  it('keeps at least one active SUPER_ADMIN', async () => {
    const other = await login(ACCOUNTS.hrManager);
    const target = await request(app)
      .get('/api/v1/users?role=SUPER_ADMIN')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(200);

    const list = target.body.data as { id: string }[];
    expect(list).toHaveLength(1);

    await request(app)
      .patch(`/api/v1/users/${(list[0] as { id: string }).id}/role`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ role: 'HR_ADMIN' })
      .expect(422);
  });

  it('returns 404 for an unknown user', async () => {
    await request(app)
      .patch('/api/v1/users/9f1c4d2e-2b3a-4c5d-8e7f-0a1b2c3d4e5f/role')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ role: 'MANAGER' })
      .expect(404);
  });
});
describe('PATCH /api/v1/users/:id/status', () => {
  let superAdmin: LoginResult;

  const findUserIdByEmail = async (email: string): Promise<string> => {
    const response = await request(app)
      .get('/api/v1/users')
      .query({ search: email, limit: 5 })
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .expect(200);

    const match = (response.body.data as { id: string; email: string }[]).find((user) => user.email === email);
    if (!match) throw new Error(`Seed user ${email} was not found`);
    return match.id;
  };

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
  });

  it('suspends a user, blocking sign-in and existing sessions', async () => {
    const target = await login(ACCOUNTS.finance);

    await request(app)
      .patch(`/api/v1/users/${target.userId}/status`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ status: 'SUSPENDED', reason: 'Under review' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send(ACCOUNTS.finance)
      .expect(403);

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(403);

    // Sessions are revoked on suspension, so the refresh token is no longer usable.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', target.refreshCookie).expect(401);
  });

  it('reactivates the user and clears the lockout state', async () => {
    const userId = await findUserIdByEmail(ACCOUNTS.finance.email);

    const response = await request(app)
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(response.body.data.status).toBe('ACTIVE');
    await request(app).post('/api/v1/auth/login').send(ACCOUNTS.finance).expect(200);
  });

  it('prevents self-deactivation', async () => {
    await request(app)
      .patch(`/api/v1/users/${superAdmin.userId}/status`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ status: 'INACTIVE' })
      .expect(422);
  });

  it('rejects an invalid status', async () => {
    await request(app)
      .patch(`/api/v1/users/${superAdmin.userId}/status`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ status: 'PENDING_ACTIVATION' })
      .expect(400);
  });
});

describe('POST /api/v1/users/:id/reset-password', () => {
  let superAdmin: LoginResult;

  beforeAll(async () => {
    superAdmin = await login(ACCOUNTS.superAdmin);
  });

  it('returns a one-time temporary password that works for sign-in', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ email: 'reset.user@superlink.local', password: 'OldPass@12345', role: 'EMPLOYEE' })
      .expect(201);

    const userId = created.body.data.id as string;
    const session = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset.user@superlink.local', password: 'OldPass@12345' })
      .expect(200);

    const reset = await request(app)
      .post(`/api/v1/users/${userId}/reset-password`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({})
      .expect(200);

    const temporaryPassword = reset.body.data.temporaryPassword as string;
    expect(temporaryPassword).toHaveLength(12);

    // The old access token and session must stop working immediately.
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.data.tokens.accessToken as string}`)
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset.user@superlink.local', password: 'OldPass@12345' })
      .expect(401);

    const signIn = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset.user@superlink.local', password: temporaryPassword })
      .expect(200);

    expect(signIn.body.data.user.mustChangePassword).toBe(true);
  });

  it('accepts an explicit new password without returning one', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ email: 'reset.explicit@superlink.local', password: 'OldPass@12345', role: 'EMPLOYEE' })
      .expect(201);

    const reset = await request(app)
      .post(`/api/v1/users/${created.body.data.id as string}/reset-password`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ newPassword: 'BrandNewPass@987', mustChangePassword: false })
      .expect(200);

    expect(reset.body.data.temporaryPassword).toBeNull();

    const signIn = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset.explicit@superlink.local', password: 'BrandNewPass@987' })
      .expect(200);

    expect(signIn.body.data.user.mustChangePassword).toBe(false);
  });

  it('rejects a weak explicit password', async () => {
    await request(app)
      .post(`/api/v1/users/${superAdmin.userId}/reset-password`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ newPassword: 'password' })
      .expect(400);
  });
});
