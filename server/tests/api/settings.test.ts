import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { settingsRouter } from '../../src/modules/settings/settings.routes';
import { v1Router } from '../../src/routes';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

// The wiring manifest mounts this router in routes/index.ts; mounting it here too
// keeps the suite runnable before that edit exists and is a no-op afterwards
// (the first matching mount answers the request).
v1Router.use('/settings', settingsRouter);

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const CUSTOM_KEY = 'test.e2eFlag';
const CORE_KEYS = [
  'companyName',
  'defaultCurrency',
  'workingDaysPerWeek',
  'weekendDays',
  'enableAnnouncements',
];

describe('/api/v1/settings', () => {
  let superAdmin: LoginResult;
  let hrAdmin: LoginResult;
  let hrManager: LoginResult;
  let employee: LoginResult;
  let originalValue: unknown = 'Superlink';
  let originalDescription: string | null = null;

  beforeAll(async () => {
    [superAdmin, hrAdmin, hrManager, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.hrManager),
      login(ACCOUNTS.employee),
    ]);

    // Guarantee the five core rows exist even if something else populated the table.
    const existing = await prisma.systemSetting.findMany({ select: { key: true } });
    const present = new Set(existing.map((row) => row.key));
    const missing = [
      { key: 'companyName', value: 'Superlink', description: 'Legal name of the organisation' },
      { key: 'defaultCurrency', value: 'INR', description: 'Currency used for salaries and payroll' },
      { key: 'workingDaysPerWeek', value: 5, description: 'Working days expected each week' },
      { key: 'weekendDays', value: ['sat', 'sun'], description: 'Days treated as the weekly off' },
      { key: 'enableAnnouncements', value: true, description: 'Whether HR can publish announcements' },
    ].filter((row) => !present.has(row.key));
    if (missing.length > 0) {
      await prisma.systemSetting.createMany({ data: missing, skipDuplicates: true });
    }

    const company = await prisma.systemSetting.findUnique({ where: { key: 'companyName' } });
    originalValue = company?.value ?? 'Superlink';
    originalDescription = company?.description ?? null;

    // A non core key proves the manager-only half of the visibility rules.
    await prisma.systemSetting.upsert({
      where: { key: CUSTOM_KEY },
      update: { value: { enabled: true }, description: 'Temporary e2e flag' },
      create: { key: CUSTOM_KEY, value: { enabled: true }, description: 'Temporary e2e flag' },
    });
  });

  afterAll(async () => {
    await prisma.systemSetting.deleteMany({ where: { key: CUSTOM_KEY } });
    await prisma.systemSetting.updateMany({
      where: { key: 'companyName' },
      data: { value: originalValue as Prisma.InputJsonValue, description: originalDescription },
    });
  });

  it('requires a session', async () => {
    await request(app).get('/api/v1/settings').expect(401);
    await request(app).get('/api/v1/settings/companyName').expect(401);
    await request(app).put('/api/v1/settings/companyName').send({ value: 'Nope' }).expect(401);
  });

  it('shows every signed in user the five core settings', async () => {
    const res = await request(app).get('/api/v1/settings').set(bearer(employee)).expect(200);
    const rows = res.body.data as Array<{ key: string }>;
    const keys = rows.map((row) => row.key);
    expect([...keys].sort()).toEqual([...CORE_KEYS].sort());
    expect(keys).not.toContain(CUSTOM_KEY);

    const core = await request(app).get('/api/v1/settings/companyName').set(bearer(employee)).expect(200);
    expect((core.body.data as { key: string }).key).toBe('companyName');
  });

  it('hides custom settings from everyone without the manage permission', async () => {
    const managerList = await request(app).get('/api/v1/settings').set(bearer(hrManager)).expect(200);
    expect((managerList.body.data as Array<{ key: string }>).map((row) => row.key)).not.toContain(CUSTOM_KEY);

    const adminList = await request(app).get('/api/v1/settings').set(bearer(hrAdmin)).expect(200);
    expect((adminList.body.data as Array<{ key: string }>).map((row) => row.key)).toContain(CUSTOM_KEY);

    await request(app).get(`/api/v1/settings/${CUSTOM_KEY}`).set(bearer(employee)).expect(403);
    const single = await request(app).get(`/api/v1/settings/${CUSTOM_KEY}`).set(bearer(superAdmin)).expect(200);
    expect(single.body.data.value).toEqual({ enabled: true });

    await request(app).get('/api/v1/settings/missingKey').set(bearer(employee)).expect(404);
  });

  it('only lets settings managers change settings', async () => {
    await request(app).put('/api/v1/settings/companyName').set(bearer(employee)).send({ value: 'Nope Inc' }).expect(403);
    await request(app).put('/api/v1/settings/companyName').set(bearer(hrManager)).send({ value: 'Nope Inc' }).expect(403);
    await request(app).delete('/api/v1/settings/companyName').set(bearer(employee)).expect(403);
    await request(app)
      .put(`/api/v1/settings/${CUSTOM_KEY}`)
      .set(bearer(employee))
      .send({ value: { enabled: false } })
      .expect(403);
  });

  it('validates the payload and the value for each key', async () => {
    await request(app).put('/api/v1/settings/companyName').set(bearer(hrAdmin)).send({}).expect(400);
    await request(app).put('/api/v1/settings/companyName').set(bearer(hrAdmin)).send({ value: null }).expect(400);

    await request(app).put('/api/v1/settings/companyName').set(bearer(hrAdmin)).send({ value: 'X' }).expect(422);
    await request(app).put('/api/v1/settings/defaultCurrency').set(bearer(hrAdmin)).send({ value: 'usd' }).expect(422);
    await request(app).put('/api/v1/settings/workingDaysPerWeek').set(bearer(hrAdmin)).send({ value: 9 }).expect(422);
    await request(app).put('/api/v1/settings/weekendDays').set(bearer(hrAdmin)).send({ value: [] }).expect(422);
    await request(app)
      .put('/api/v1/settings/weekendDays')
      .set(bearer(hrAdmin))
      .send({ value: ['sat', 'sat'] })
      .expect(422);
    await request(app).put('/api/v1/settings/enableAnnouncements').set(bearer(hrAdmin)).send({ value: 'yes' }).expect(422);
    await request(app).put('/api/v1/settings/notARealKey').set(bearer(hrAdmin)).send({ value: 'anything' }).expect(422);
  });

  it('persists updates and writes an audit entry', async () => {
    const updated = await request(app)
      .put('/api/v1/settings/companyName')
      .set(bearer(hrAdmin))
      .send({ value: 'Acme Industries Pvt Ltd', description: 'Temporary e2e name' })
      .expect(200);
    expect(updated.body.data.value).toBe('Acme Industries Pvt Ltd');
    expect(updated.body.data.description).toBe('Temporary e2e name');

    const fetched = await request(app).get('/api/v1/settings/companyName').set(bearer(employee)).expect(200);
    expect(fetched.body.data.value).toBe('Acme Industries Pvt Ltd');

    const second = await request(app)
      .put('/api/v1/settings/companyName')
      .set(bearer(superAdmin))
      .send({ value: 'Superlink Global' })
      .expect(200);
    expect(second.body.data.value).toBe('Superlink Global');

    const audit = await request(app)
      .get('/api/v1/audit-logs?action=SETTINGS_UPDATE&limit=20')
      .set(bearer(superAdmin))
      .expect(200);
    const rows = audit.body.data as Array<{ action: string; userEmail: string | null; entityId: string | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.entityId === 'companyName' && row.userEmail === ACCOUNTS.hrAdmin.email)).toBe(true);
    expect(rows.some((row) => row.entityId === 'companyName' && row.userEmail === ACCOUNTS.superAdmin.email)).toBe(true);
  });

  it('refuses to delete core settings but removes custom ones', async () => {
    await request(app).delete('/api/v1/settings/companyName').set(bearer(hrAdmin)).expect(422);
    await request(app).delete('/api/v1/settings/does-not-exist').set(bearer(hrAdmin)).expect(404);

    const removed = await request(app).delete(`/api/v1/settings/${CUSTOM_KEY}`).set(bearer(hrAdmin)).expect(200);
    expect((removed.body.data as { key: string }).key).toBe(CUSTOM_KEY);

    await request(app).get(`/api/v1/settings/${CUSTOM_KEY}`).set(bearer(superAdmin)).expect(404);
    await request(app).delete(`/api/v1/settings/${CUSTOM_KEY}`).set(bearer(hrAdmin)).expect(404);
  });
});
