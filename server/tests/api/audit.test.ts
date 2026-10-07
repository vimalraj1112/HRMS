import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { addUtcDays, startOfUtcDay, toDateInputValue } from '../../src/utils/workdays';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userEmail: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
}

/** A Monday at least a week out so the leave type notice rule is satisfied. */
function futureRange(startInDays: number): { start: string; end: string; year: number } {
  let start = addUtcDays(startOfUtcDay(new Date()), startInDays);
  if (start.getUTCDay() === 0) start = addUtcDays(start, 1);
  if (start.getUTCDay() === 6) start = addUtcDays(start, 2);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(addUtcDays(start, 1)),
    year: start.getUTCFullYear(),
  };
}

describe('/api/v1/audit-logs', () => {
  let superAdmin: LoginResult;
  let hrAdmin: LoginResult;
  let employee: LoginResult;
  const today = toDateInputValue(new Date());

  beforeAll(async () => {
    [superAdmin, hrAdmin, employee] = await Promise.all([
      login(ACCOUNTS.superAdmin),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
    ]);
  });

  it('requires authentication and the audit permission', async () => {
    await request(app).get('/api/v1/audit-logs').expect(401);
    await request(app).get('/api/v1/audit-logs').set(bearer(employee)).expect(403);
    await request(app).get('/api/v1/audit-logs').set(bearer(hrAdmin)).expect(403);
    await request(app).get('/api/v1/audit-logs').set(bearer(superAdmin)).expect(200);
  });

  it('records an entry for a department change with before and after values', async () => {
    const suffix = String(Date.now() % 100000);
    const name = `Audit Dept ${suffix}`;

    const created = await request(app)
      .post('/api/v1/departments')
      .set(bearer(hrAdmin))
      .send({ name, code: `AUD${suffix}`.slice(0, 20) })
      .expect(201);
    const id = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/departments/${id}`)
      .set(bearer(hrAdmin))
      .send({ name: `${name} renamed` })
      .expect(200);

    const filtered = await request(app)
      .get(`/api/v1/audit-logs?entity=Department&entityId=${id}&limit=20`)
      .set(bearer(superAdmin))
      .expect(200);

    const rows = filtered.body.data as AuditRow[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.entity === 'Department' && row.entityId === id)).toBe(true);
    expect(rows.some((row) => row.action === 'DEPARTMENT_CREATE')).toBe(true);

    const update = rows.find((row) => row.action === 'DEPARTMENT_UPDATE');
    expect(update?.userEmail).toBe(hrAdminEmail());
    expect((update?.oldValue as { name?: string } | null)?.name).toBe(name);
    expect((update?.newValue as { name?: string } | null)?.name).toBe(`${name} renamed`);

    const single = await request(app).get(`/api/v1/audit-logs/${update?.id}`).set(bearer(superAdmin)).expect(200);
    expect(single.body.data.id).toBe(update?.id);

    await request(app)
      .get(`/api/v1/audit-logs/${randomUUID()}`)
      .set(bearer(superAdmin))
      .expect(404);
  });

  it('filters by action, user and date range and rejects backwards ranges', async () => {
    const year = new Date().getUTCFullYear();

    const byAction = await request(app)
      .get('/api/v1/audit-logs?action=DEPARTMENT_UPDATE&limit=50')
      .set(bearer(superAdmin))
      .expect(200);
    expect((byAction.body.data as AuditRow[]).every((row) => row.action === 'DEPARTMENT_UPDATE')).toBe(true);

    const byUser = await request(app)
      .get(`/api/v1/audit-logs?userEmail=${encodeURIComponent(hrAdminEmail())}&limit=50`)
      .set(bearer(superAdmin))
      .expect(200);
    expect((byUser.body.data as AuditRow[]).every((row) => row.userEmail === hrAdminEmail())).toBe(true);

    const todayOnly = await request(app)
      .get(`/api/v1/audit-logs?from=${today}&to=${today}&limit=100`)
      .set(bearer(superAdmin))
      .expect(200);
    expect((todayOnly.body.data as AuditRow[]).length).toBeGreaterThan(0);
    expect(todayOnly.body.meta.total).toBeGreaterThan(0);

    const backwards = await request(app)
      .get(`/api/v1/audit-logs?from=${year}-12-31&to=${year}-01-01`)
      .set(bearer(superAdmin))
      .expect(400);

    expect(backwards.body.success).toBe(false);
  });

  it('returns action and entity facets for the filter dropdowns', async () => {
    const response = await request(app).get('/api/v1/audit-logs?limit=1').set(bearer(superAdmin)).expect(200);

    const facets = response.body.meta.facets as {
      actions: Array<{ value: string; count: number }>;
      entities: Array<{ value: string; count: number }>;
    };

    expect(facets.actions.some((facet) => facet.value === 'LOGIN')).toBe(true);
    expect(facets.entities.some((facet) => facet.value === 'Department')).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.hasNext).toBe(true);
  });
});

describe('/api/v1/notifications', () => {
  let manager: LoginResult;
  let hrAdmin: LoginResult;
  let employee: LoginResult;

  beforeAll(async () => {
    [manager, hrAdmin, employee] = await Promise.all([
      login(ACCOUNTS.manager),
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
    ]);
  });

  it('requires authentication and ownership', async () => {
    await request(app).get('/api/v1/notifications').expect(401);

    const own = await request(app).get('/api/v1/notifications').set(bearer(employee)).expect(200);
    const rows = own.body.data as Array<{ id: string; userId: string }>;
    expect(rows.every((row) => row.userId === employee.userId)).toBe(true);
    expect(own.body.meta.unreadCount).toBeGreaterThanOrEqual(0);

    if (rows[0]) {
      const someoneElses = await request(app)
        .patch(`/api/v1/notifications/${rows[0].id}/read`)
        .set(bearer(hrAdmin))
        .expect(404);
      expect(someoneElses.body.success).toBe(false);
    }
  });

  it('notifies the manager and the employee through the leave flow', async () => {
    const before = await request(app).get('/api/v1/notifications?limit=1').set(bearer(manager)).expect(200);
    const beforeCount = before.body.meta.total as number;

    const types = await request(app).get('/api/v1/leave-types?search=CL').set(bearer(employee)).expect(200);
    const casualLeave = (types.body.data as Array<{ id: string; code: string }>).find((row) => row.code === 'CL');
    if (!casualLeave) throw new Error('Seeded casual leave type not found');

    const range = futureRange(45);
    const applied = await request(app)
      .post('/api/v1/leaves')
      .set(bearer(employee))
      .send({
        leaveTypeId: casualLeave.id,
        startDate: range.start,
        endDate: range.end,
        reason: 'Notification flow test request',
      })
      .expect(201);
    const requestId = applied.body.data.id as string;

    const managerAfter = await request(app).get('/api/v1/notifications?limit=5').set(bearer(manager)).expect(200);
    expect(managerAfter.body.meta.total).toBe(beforeCount + 1);
    const approval = (managerAfter.body.data as Array<{ title: string; link: string | null; entityId: string | null; isRead: boolean }>).find(
      (row) => row.entityId === requestId,
    );
    expect(approval?.title).toContain('Leave request');
    expect(approval?.link).toBe('/leaves/requests');
    expect(approval?.isRead).toBe(false);

    await request(app).post(`/api/v1/leaves/${requestId}/decision`).set(bearer(manager)).send({ decision: 'APPROVE' }).expect(200);
    await request(app).post(`/api/v1/leaves/${requestId}/decision`).set(bearer(hrAdmin)).send({ decision: 'APPROVE' }).expect(200);

    const employeeNotifications = await request(app).get('/api/v1/notifications?limit=5').set(bearer(employee)).expect(200);
    const approved = (employeeNotifications.body.data as Array<{ id: string; title: string; entityId: string | null; type: string }>).find(
      (row) => row.entityId === requestId,
    );
    expect(approved?.title).toContain('approved');
    expect(approved?.type).toBe('SUCCESS');

    const count = await request(app).get('/api/v1/notifications/unread-count').set(bearer(employee)).expect(200);
    const unread = count.body.data.unreadCount as number;
    expect(unread).toBeGreaterThanOrEqual(1);

    const marked = await request(app)
      .patch(`/api/v1/notifications/${approved?.id}/read`)
      .set(bearer(employee))
      .expect(200);
    expect(marked.body.data.isRead).toBe(true);
    expect(marked.body.data.readAt).toBeTruthy();

    const afterMark = await request(app).get('/api/v1/notifications/unread-count').set(bearer(employee)).expect(200);
    expect(afterMark.body.data.unreadCount).toBe(unread - 1);

    const unreadOnly = await request(app)
      .get('/api/v1/notifications?unreadOnly=true&limit=50')
      .set(bearer(employee))
      .expect(200);
    expect((unreadOnly.body.data as Array<{ isRead: boolean }>).every((row) => !row.isRead)).toBe(true);

    await request(app).patch(`/api/v1/notifications/${approved?.id}/unread`).set(bearer(employee)).expect(200);

    const readAll = await request(app).post('/api/v1/notifications/read-all').set(bearer(employee)).expect(200);
    expect(readAll.body.data.updated).toBeGreaterThanOrEqual(1);

    const afterAll = await request(app).get('/api/v1/notifications/unread-count').set(bearer(employee)).expect(200);
    expect(afterAll.body.data.unreadCount).toBe(0);
  });
});

function hrAdminEmail(): string {
  return ACCOUNTS.hrAdmin.email;
}