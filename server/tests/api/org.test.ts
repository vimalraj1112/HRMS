import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

interface OrgRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  _count?: { employees: number };
}

describe('/api/v1/departments', () => {
  let superAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [superAdmin, manager, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
    ]);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/departments').expect(401);
  });

  it('is denied for employees without department:read', async () => {
    await request(app).get('/api/v1/departments').set(bearer(employee)).expect(403);

    const list = await request(app).get('/api/v1/departments?limit=1').set(bearer(superAdmin)).expect(200);
    const id = (list.body.data[0] as OrgRow).id;

    await request(app).get(`/api/v1/departments/${id}`).set(bearer(employee)).expect(403);
  });

  it('is readable by managers', async () => {
    const response = await request(app).get('/api/v1/departments').set(bearer(manager)).expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('creates, updates and deletes a department', async () => {
    const code = `TST${Date.now() % 1000}`;

    const created = await request(app)
      .post('/api/v1/departments')
      .set(bearer(superAdmin))
      .send({ name: 'Quality Assurance', code, description: 'Quality team' })
      .expect(201);

    const id = created.body.data.id as string;
    expect(created.body.data.code).toBe(code);
    expect(created.body.data.isActive).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/departments/${id}`)
      .set(bearer(superAdmin))
      .send({ description: 'Quality and reliability' })
      .expect(200);

    expect(updated.body.data.description).toBe('Quality and reliability');

    const fetched = await request(app).get(`/api/v1/departments/${id}`).set(bearer(superAdmin)).expect(200);
    expect(fetched.body.data.id).toBe(id);

    const deletion = await request(app).delete(`/api/v1/departments/${id}`).set(bearer(superAdmin)).expect(200);
    expect(deletion.body.data.id).toBe(id);

    await request(app).get(`/api/v1/departments/${id}`).set(bearer(superAdmin)).expect(404);
  });

  it('rejects duplicate names and codes', async () => {
    const existing = await request(app).get('/api/v1/departments?limit=1').set(bearer(superAdmin)).expect(200);
    const { name, code } = existing.body.data[0] as OrgRow;

    await request(app).post('/api/v1/departments').set(bearer(superAdmin)).send({ name, code }).expect(409);
  });

  it('normalises codes to upper case and rejects odd characters', async () => {
    const created = await request(app)
      .post('/api/v1/departments')
      .set(bearer(superAdmin))
      .send({ name: 'Field Ops', code: 'fieldops' })
      .expect(201);

    expect(created.body.data.code).toBe('FIELDOPS');

    await request(app)
      .post('/api/v1/departments')
      .set(bearer(superAdmin))
      .send({ name: 'Bad Code', code: 'bad code!' })
      .expect(400);

    await request(app).delete(`/api/v1/departments/${created.body.data.id as string}`).set(bearer(superAdmin)).expect(200);
  });

  it('will not deactivate or delete a department that still has employees', async () => {
    const list = await request(app).get('/api/v1/departments?limit=100').set(bearer(superAdmin)).expect(200);
    const withStaff = (list.body.data as OrgRow[]).find((row) => (row._count?.employees ?? 0) > 0) as OrgRow;

    const deactivate = await request(app)
      .patch(`/api/v1/departments/${withStaff.id}`)
      .set(bearer(superAdmin))
      .send({ isActive: false })
      .expect(422);
    expect(deactivate.body.message).toContain('active employee');

    await request(app).delete(`/api/v1/departments/${withStaff.id}`).set(bearer(superAdmin)).expect(409);
  });

  it('is denied for employees on write operations', async () => {
    await request(app)
      .post('/api/v1/departments')
      .set(bearer(employee))
      .send({ name: 'Rogue', code: 'RGE' })
      .expect(403);
  });
});

describe('/api/v1/designations', () => {
  let superAdmin: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [superAdmin, employee] = await Promise.all([login(ACCOUNTS.superAdmin), login(ACCOUNTS.employee)]);
  });

  it('requires authentication and denies employees', async () => {
    await request(app).get('/api/v1/designations').expect(401);
    await request(app).get('/api/v1/designations').set(bearer(employee)).expect(403);

    const list = await request(app).get('/api/v1/designations?limit=1').set(bearer(superAdmin)).expect(200);
    const id = (list.body.data[0] as OrgRow).id;

    await request(app).get(`/api/v1/designations/${id}`).set(bearer(employee)).expect(403);
  });

  it('lists designations for an administrator', async () => {
    const response = await request(app).get('/api/v1/designations?limit=100').set(bearer(superAdmin)).expect(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 100 });
  });

  it('creates, updates and deletes a designation', async () => {
    const code = `DSG${Date.now() % 1000}`;

    const created = await request(app)
      .post('/api/v1/designations')
      .set(bearer(superAdmin))
      .send({ name: 'Principal Engineer', code, level: 7 })
      .expect(201);

    const id = created.body.data.id as string;
    expect(created.body.data.level).toBe(7);

    await request(app)
      .patch(`/api/v1/designations/${id}`)
      .set(bearer(superAdmin))
      .send({ level: 8 })
      .expect(200);

    await request(app).get(`/api/v1/designations/${id}`).set(bearer(superAdmin)).expect(200);
    await request(app).delete(`/api/v1/designations/${id}`).set(bearer(superAdmin)).expect(200);
    await request(app).get(`/api/v1/designations/${id}`).set(bearer(superAdmin)).expect(404);
  });

  it('rejects duplicates and invalid levels', async () => {
    const list = await request(app).get('/api/v1/designations?limit=1').set(bearer(superAdmin)).expect(200);
    const { name, code } = list.body.data[0] as OrgRow;

    await request(app).post('/api/v1/designations').set(bearer(superAdmin)).send({ name, code }).expect(409);
    await request(app)
      .post('/api/v1/designations')
      .set(bearer(superAdmin))
      .send({ name: 'Intern', code: 'INT', level: 99 })
      .expect(400);
  });

  it('will not deactivate a designation still assigned to employees', async () => {
    const list = await request(app).get('/api/v1/designations?limit=100').set(bearer(superAdmin)).expect(200);
    const assigned = (list.body.data as OrgRow[]).find((row) => (row._count?.employees ?? 0) > 0) as OrgRow;

    const response = await request(app)
      .patch(`/api/v1/designations/${assigned.id}`)
      .set(bearer(superAdmin))
      .send({ isActive: false })
      .expect(422);
    expect(response.body.message).toContain('Reassign');
  });
});
