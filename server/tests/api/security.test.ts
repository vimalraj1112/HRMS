import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACCOUNTS, app, login } from '../helpers/testApp';

describe('security headers and transport', () => {
  it('does not advertise the server stack', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('applies helmet hardening headers', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(response.headers['referrer-policy']).toBeDefined();
  });

  it('echoes a supplied request id and generates one otherwise', async () => {
    const supplied = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'test-request-id-1')
      .expect(200);
    expect(supplied.headers['x-request-id']).toBe('test-request-id-1');

    const generated = await request(app).get('/api/v1/health').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('publishes draft-7 rate limit headers', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.headers['ratelimit-policy']).toBeDefined();
    expect(response.headers['ratelimit']).toBeDefined();
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('only allows the configured origin to read CORS responses', async () => {
    const allowed = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const rejected = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    expect(rejected.status).toBeGreaterThanOrEqual(400);
  });

  it('answers unknown routes with the standard JSON error envelope', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Route GET /api/v1/does-not-exist does not exist',
      errors: [],
      meta: null,
    });
    expect(response.body).not.toHaveProperty('stack');
  });
});

describe('request authentication', () => {
  const protectedRoutes: ReadonlyArray<{ method: 'get' | 'post' | 'patch' | 'put'; path: string }> = [
    { method: 'get', path: '/api/v1/dashboard' },
    { method: 'get', path: '/api/v1/dashboard/announcements' },
    { method: 'get', path: '/api/v1/recruitment/jobs' },
    { method: 'get', path: '/api/v1/recruitment/candidates' },
    { method: 'get', path: '/api/v1/performance/goals' },
    { method: 'get', path: '/api/v1/performance/reviews' },
    { method: 'get', path: '/api/v1/announcements' },
    { method: 'get', path: '/api/v1/reports/overview' },
    { method: 'get', path: '/api/v1/settings' },
    { method: 'post', path: '/api/v1/announcements' },
    { method: 'post', path: '/api/v1/performance/goals' },
    { method: 'put', path: '/api/v1/settings/defaultCurrency' },
    { method: 'get', path: '/api/v1/leaves/my' },
    { method: 'get', path: '/api/v1/leave-types' },
    { method: 'get', path: '/api/v1/holidays' },
  ];

  it.each(protectedRoutes)('rejects $method $path without a token', async ({ method, path }) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects a malformed authorization header', async () => {
    await request(app).get('/api/v1/dashboard').set('Authorization', 'Basic abc').expect(401);
    await request(app).get('/api/v1/dashboard').set('Authorization', 'Bearer').expect(401);
    await request(app).get('/api/v1/dashboard').set('Authorization', 'Bearer not.a.jwt').expect(401);
  });

  it('never leaks a stack trace on failures', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.text).not.toMatch(/at .*\.ts:\d+/);
    expect(response.text).not.toContain('node_modules');
  });
});

describe('payload limits', () => {
  it('rejects a body larger than the 1mb JSON limit', async () => {
    const { accessToken } = await login(ACCOUNTS.superAdmin);
    const response = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Huge', content: 'x'.repeat(2 * 1024 * 1024) });
    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
  });
});
