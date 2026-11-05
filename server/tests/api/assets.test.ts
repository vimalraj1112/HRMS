import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const TAG_PREFIX = 'TST-ASSET-';

describe('/api/v1/assets', () => {
  let hrAdmin: LoginResult;
  let employee: LoginResult;
  let manager: LoginResult;
  let finance: LoginResult;
  let employeeRecordId: string;
  let assetId: string;

  beforeAll(async () => {
    [hrAdmin, employee, manager, finance] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.finance),
    ]);

    employeeRecordId = employee.employeeId ?? '';
    expect(employeeRecordId).not.toBe('');

    await prisma.asset.deleteMany({ where: { assetTag: { startsWith: TAG_PREFIX } } });
  });

  afterAll(async () => {
    const assets = await prisma.asset.findMany({
      where: { assetTag: { startsWith: TAG_PREFIX } },
      select: { id: true },
    });
    const ids = assets.map((asset) => asset.id);
    await prisma.assetAssignment.deleteMany({ where: { assetId: { in: ids } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids } } });
  });

  it('creates an asset for HR and records an audit entry', async () => {
    const response = await request(app)
      .post('/api/v1/assets')
      .set(bearer(hrAdmin))
      .send({
        assetTag: `${TAG_PREFIX}001`,
        name: 'Test MacBook',
        category: 'LAPTOP',
        brand: 'Apple',
        model: 'MacBook Pro 14',
        serialNumber: `${TAG_PREFIX}SN-001`,
        purchaseDate: '2026-01-15',
        purchaseCost: 185000,
        warrantyExpiry: '2029-01-14',
      })
      .expect(201);

    assetId = response.body.data.id as string;
    expect(response.body.data.status).toBe('AVAILABLE');
    expect(response.body.data.purchaseCost).toBe(185000);
    expect(response.body.data.purchaseDate).toBe('2026-01-15');

    const audit = await prisma.auditLog.findFirst({
      where: { action: AuditAction.ASSET_CREATE, entityId: assetId },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects a duplicate asset tag with 409', async () => {
    await request(app)
      .post('/api/v1/assets')
      .set(bearer(hrAdmin))
      .send({ assetTag: `${TAG_PREFIX}001`, name: 'Duplicate', category: 'OTHER' })
      .expect(409);
  });

  it('forbids employees from creating assets', async () => {
    await request(app)
      .post('/api/v1/assets')
      .set(bearer(employee))
      .send({ assetTag: `${TAG_PREFIX}999`, name: 'Nope', category: 'OTHER' })
      .expect(403);
  });

  it('assigns the asset to an employee and hides it from others', async () => {
    const assigned = await request(app)
      .post(`/api/v1/assets/${assetId}/assign`)
      .set(bearer(hrAdmin))
      .send({ employeeId: employeeRecordId, issueCondition: 'New' })
      .expect(200);

    expect(assigned.body.data.status).toBe('ASSIGNED');
    expect(assigned.body.data.assignedEmployee.id).toBe(employeeRecordId);

    const ownList = await request(app)
      .get('/api/v1/assets')
      .query({ search: `${TAG_PREFIX}001` })
      .set(bearer(employee))
      .expect(200);
    expect(ownList.body.data).toHaveLength(1);

    const otherList = await request(app)
      .get('/api/v1/assets')
      .query({ search: `${TAG_PREFIX}001` })
      .set(bearer(manager))
      .expect(200);
    expect(otherList.body.data).toHaveLength(0);

    await request(app).get(`/api/v1/assets/${assetId}`).set(bearer(manager)).expect(403);
  });

  it('refuses a second assignment until the asset is returned', async () => {
    await request(app)
      .post(`/api/v1/assets/${assetId}/assign`)
      .set(bearer(hrAdmin))
      .send({ employeeId: employeeRecordId })
      .expect(409);
  });

  it('returns the asset and closes the active assignment', async () => {
    const returned = await request(app)
      .post(`/api/v1/assets/${assetId}/return`)
      .set(bearer(hrAdmin))
      .send({ returnCondition: 'Good', status: 'AVAILABLE' })
      .expect(200);

    expect(returned.body.data.status).toBe('AVAILABLE');
    expect(returned.body.data.assignedEmployeeId).toBeNull();

    const history = await request(app)
      .get(`/api/v1/assets/${assetId}/history`)
      .set(bearer(hrAdmin))
      .expect(200);

    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].returnedAt).not.toBeNull();
    expect(history.body.data[0].returnCondition).toBe('Good');

    const myHistory = await request(app)
      .get('/api/v1/assets/my-history')
      .set(bearer(employee))
      .expect(200);
    expect((myHistory.body.data as { assetId: string }[]).some((entry) => entry.assetId === assetId)).toBe(true);
  });

  it('returns asset statistics scoped to what the caller may see', async () => {
    const response = await request(app)
      .get('/api/v1/assets/stats')
      .set(bearer(finance))
      .expect(200);

    expect(response.body.data.total).toBeGreaterThanOrEqual(1);
    expect(response.body.data.assigned + response.body.data.available).toBeGreaterThanOrEqual(1);
  });

  it('soft deletes an unassigned asset', async () => {
    await request(app).delete(`/api/v1/assets/${assetId}`).set(bearer(hrAdmin)).expect(200);
    await request(app).get(`/api/v1/assets/${assetId}`).set(bearer(hrAdmin)).expect(404);
  });
});
