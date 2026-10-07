import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { announcementsRouter } from '../../src/modules/announcements/announcements.routes';
import { v1Router } from '../../src/routes';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

// The wiring manifest mounts this router in routes/index.ts; mounting it here too
// keeps the suite runnable before that edit exists and is a no-op afterwards
// (the first matching mount answers the request).
v1Router.use('/announcements', announcementsRouter);

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });
const BASE = '/api/v1/announcements';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  audience: string;
  departmentId: string | null;
  role: string | null;
  employeeId: string | null;
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  isRead?: boolean;
  readAt?: string | null;
}

/** The fan out is fire and forget, so the test waits for it to land. */
async function eventually<T>(read: () => Promise<T | null>, attempts = 50): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Condition was never met');
}

describe('/api/v1/announcements', () => {
  let hrAdmin: LoginResult;
  let employee: LoginResult;
  let outsider: LoginResult;
  let manager: LoginResult;
  let employeeId: string;
  let otherEmployeeId: string;
  let employeeDepartmentId: string;
  let otherDepartmentId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    [hrAdmin, employee, outsider, manager] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
      login(ACCOUNTS.finance),
      login(ACCOUNTS.manager),
    ]);

    employeeId = employee.employeeId ?? '';
    otherEmployeeId = manager.employeeId ?? '';
    expect(employeeId).not.toBe('');
    expect(otherEmployeeId).not.toBe('');

    const record = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });
    employeeDepartmentId = record?.departmentId ?? '';
    expect(employeeDepartmentId).not.toBe('');

    const otherDepartment = await prisma.department.findFirst({
      where: { id: { not: employeeDepartmentId } },
      select: { id: true },
    });
    otherDepartmentId = otherDepartment?.id ?? '';
    expect(otherDepartmentId).not.toBe('');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { entityId: { in: createdIds } } });
    await prisma.announcement.deleteMany({ where: { id: { in: createdIds } } });
  });

  async function publish(session: LoginResult, body: Record<string, unknown>, expected = 201): Promise<AnnouncementRow> {
    const response = await request(app).post(BASE).set(bearer(session)).send(body).expect(expected);
    if (expected === 201) createdIds.push(response.body.data.id as string);
    return response.body.data as AnnouncementRow;
  }

  async function unreadCount(session: LoginResult): Promise<number> {
    const response = await request(app).get(`${BASE}/unread-count`).set(bearer(session)).expect(200);
    return response.body.data.unreadCount as number;
  }

  async function visibleIds(session: LoginResult): Promise<string[]> {
    const response = await request(app).get(`${BASE}?limit=100`).set(bearer(session)).expect(200);
    return (response.body.data as AnnouncementRow[]).map((row) => row.id);
  }

  it('rejects unauthenticated requests', async () => {
    await request(app).get(BASE).expect(401);
    await request(app).get(`${BASE}/unread-count`).expect(401);
    await request(app).post(BASE).send({ title: 'No session', content: 'Nope' }).expect(401);
  });

  it('rejects a malformed announcement id', async () => {
    await request(app).get(`${BASE}/not-a-uuid`).set(bearer(employee)).expect(400);
    await request(app).post(`${BASE}/not-a-uuid/read`).set(bearer(employee)).expect(400);
  });

  it('stops an employee publishing an announcement', async () => {
    await publish(employee, { title: 'Sneaky post', content: 'Should not be allowed' }, 403);
  });

  it('lets HR publish a company wide announcement', async () => {
    const announcement = await publish(hrAdmin, {
      title: 'Benefits enrolment window',
      content: 'Submit your selections before the end of the month.',
    });

    expect(announcement.audience).toBe('ALL');
    expect(announcement.isPinned).toBe(false);
    expect(announcement.publishedAt).toBeTruthy();
    expect(announcement.expiresAt).toBeNull();
    expect(announcement.departmentId).toBeNull();
  });

  it('shows company wide announcements to every account', async () => {
    const announcement = await publish(hrAdmin, {
      title: 'Town hall on Friday',
      content: 'Join the all hands at 4pm.',
    });

    expect(await visibleIds(employee)).toContain(announcement.id);
    expect(await visibleIds(outsider)).toContain(announcement.id);

    const detail = await request(app)
      .get(`${BASE}/${announcement.id}`)
      .set(bearer(employee))
      .expect(200);
    expect((detail.body.data as AnnouncementRow).isRead).toBe(false);
  });

  it('requires a target for every targeted audience', async () => {
    await publish(hrAdmin, { title: 'Dept only', content: 'Body', audience: 'DEPARTMENT' }, 422);
    await publish(hrAdmin, { title: 'Desig only', content: 'Body', audience: 'DESIGNATION' }, 422);
    await publish(hrAdmin, { title: 'Role only', content: 'Body', audience: 'ROLE' }, 422);
    await publish(hrAdmin, { title: 'Person only', content: 'Body', audience: 'EMPLOYEE' }, 422);
  });

  it('rejects a target that does not exist', async () => {
    await publish(
      hrAdmin,
      {
        title: 'Ghost department',
        content: 'Body',
        audience: 'DEPARTMENT',
        departmentId: '00000000-0000-4000-8000-000000000000',
      },
      422,
    );
  });

  it('rejects an expiry at or before the publication date', async () => {
    await publish(
      hrAdmin,
      { title: 'Backwards window', content: 'Body', publishedAt: '2026-01-01', expiresAt: '2025-12-31' },
      422,
    );
  });

  it('hides announcements that are not yet published or already expired', async () => {
    const upcoming = await publish(hrAdmin, {
      title: 'Scheduled post',
      content: 'Only visible in the future.',
      publishedAt: '2030-01-01',
    });
    const expired = await publish(hrAdmin, {
      title: 'Stale post',
      content: 'Left over from an earlier campaign.',
      publishedAt: '2020-01-01',
      expiresAt: '2020-02-01',
    });

    expect(await visibleIds(employee)).not.toContain(upcoming.id);
    expect(await visibleIds(employee)).not.toContain(expired.id);

    await request(app).get(`${BASE}/${upcoming.id}`).set(bearer(employee)).expect(404);
    await request(app).get(`${BASE}/${expired.id}`).set(bearer(employee)).expect(404);
    await request(app).post(`${BASE}/${upcoming.id}/read`).set(bearer(employee)).expect(404);
  });

  it('matches the department audience', async () => {
    const mine = await publish(hrAdmin, {
      title: 'Engineering standup change',
      content: 'Standup moves to 9:45.',
      audience: 'DEPARTMENT',
      departmentId: employeeDepartmentId,
    });
    const theirs = await publish(hrAdmin, {
      title: 'Finance quarter close',
      content: 'Books close next week.',
      audience: 'DEPARTMENT',
      departmentId: otherDepartmentId,
    });

    const ids = await visibleIds(employee);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('matches the role audience', async () => {
    const forEmployees = await publish(hrAdmin, {
      title: 'Policy refresh for all staff',
      content: 'Read the updated handbook.',
      audience: 'ROLE',
      role: 'EMPLOYEE',
    });
    const forRecruiters = await publish(hrAdmin, {
      title: 'Sourcing budget',
      content: 'New referral bonuses apply.',
      audience: 'ROLE',
      role: 'RECRUITER',
    });

    const ids = await visibleIds(employee);
    expect(ids).toContain(forEmployees.id);
    expect(ids).not.toContain(forRecruiters.id);
  });

  it('matches the individual audience', async () => {
    const forMe = await publish(hrAdmin, {
      title: 'Document verification reminder',
      content: 'Please upload the missing document.',
      audience: 'EMPLOYEE',
      employeeId,
    });
    const forSomebodyElse = await publish(hrAdmin, {
      title: 'Probation review',
      content: 'Your probation review is due.',
      audience: 'EMPLOYEE',
      employeeId: otherEmployeeId,
    });

    const ids = await visibleIds(employee);
    expect(ids).toContain(forMe.id);
    expect(ids).not.toContain(forSomebodyElse.id);
  });

  it('offers a pinned only filter and keeps pinned posts at the top', async () => {
    const pinned = await publish(hrAdmin, {
      title: 'Office closed Monday',
      content: 'The office is closed for the holiday.',
      isPinned: true,
    });

    const response = await request(app).get(`${BASE}?pinnedOnly=true&limit=100`).set(bearer(employee)).expect(200);
    const rows = response.body.data as AnnouncementRow[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.id)).toContain(pinned.id);
    expect(rows.every((row) => row.isPinned)).toBe(true);

    const firstPage = await request(app).get(`${BASE}?limit=100`).set(bearer(employee)).expect(200);
    expect((firstPage.body.data as AnnouncementRow[])[0]?.id).toBe(pinned.id);
  });

  it('counts unread announcements and marking one read is idempotent', async () => {
    const before = await unreadCount(employee);
    const announcement = await publish(hrAdmin, {
      title: 'Insurance renewal',
      content: 'Renew your coverage.',
    });
    const after = await unreadCount(employee);
    expect(after).toBe(before + 1);

    const first = await request(app)
      .post(`${BASE}/${announcement.id}/read`)
      .set(bearer(employee))
      .expect(200);
    expect(first.body.data.id).toBe(announcement.id);
    expect(first.body.data.readAt).toBeTruthy();

    const counted = await request(app)
      .get(`${BASE}/${announcement.id}`)
      .set(bearer(employee))
      .expect(200);
    expect((counted.body.data as AnnouncementRow).isRead).toBe(true);
    expect(await unreadCount(employee)).toBe(after - 1);

    const second = await request(app)
      .post(`${BASE}/${announcement.id}/read`)
      .set(bearer(employee))
      .expect(200);
    expect(second.body.data.readAt).toBe(first.body.data.readAt);
    expect(await unreadCount(employee)).toBe(after - 1);
  });

  it('fans a notification out to the audience', async () => {
    const announcement = await publish(hrAdmin, {
      title: 'Fire drill at noon',
      content: 'Everyone gathers at the assembly point.',
    });

    const count = await eventually(async () => {
      const found = await prisma.notification.count({
        where: { entityType: 'Announcement', entityId: announcement.id },
      });
      return found > 0 ? found : null;
    });

    expect(count).toBeGreaterThan(0);
    // The publisher is the one account left out of the fan out.
    const toPublisher = await prisma.notification.count({
      where: { entityType: 'Announcement', entityId: announcement.id, userId: hrAdmin.userId },
    });
    expect(toPublisher).toBe(0);
  });

  it('lets HR update an announcement and re validate its target', async () => {
    const announcement = await publish(hrAdmin, { title: 'Editable post', content: 'Original body' });

    const pinned = await request(app)
      .patch(`${BASE}/${announcement.id}`)
      .set(bearer(hrAdmin))
      .send({ isPinned: true, content: 'Updated body' })
      .expect(200);
    expect((pinned.body.data as AnnouncementRow).isPinned).toBe(true);
    expect((pinned.body.data as AnnouncementRow).content).toBe('Updated body');

    // Switching to a targeted audience without its target is refused.
    await request(app)
      .patch(`${BASE}/${announcement.id}`)
      .set(bearer(hrAdmin))
      .send({ audience: 'EMPLOYEE' })
      .expect(422);

    const retargeted = await request(app)
      .patch(`${BASE}/${announcement.id}`)
      .set(bearer(hrAdmin))
      .send({ audience: 'EMPLOYEE', employeeId })
      .expect(200);
    expect((retargeted.body.data as AnnouncementRow).audience).toBe('EMPLOYEE');
    expect((retargeted.body.data as AnnouncementRow).employeeId).toBe(employeeId);

    await request(app)
      .patch(`${BASE}/${announcement.id}`)
      .set(bearer(hrAdmin))
      .send({})
      .expect(400);
  });

  it('stops an employee editing or deleting an announcement', async () => {
    const announcement = await publish(hrAdmin, { title: 'Guarded post', content: 'Body' });

    await request(app).patch(`${BASE}/${announcement.id}`).set(bearer(employee)).send({ isPinned: true }).expect(403);
    await request(app).delete(`${BASE}/${announcement.id}`).set(bearer(employee)).expect(403);
  });

  it('deletes an announcement, hides it and audits the lifecycle', async () => {
    const announcement = await publish(hrAdmin, { title: 'Temporary notice', content: 'Body' });

    await request(app)
      .patch(`${BASE}/${announcement.id}`)
      .set(bearer(hrAdmin))
      .send({ isPinned: true })
      .expect(200);

    await request(app).delete(`${BASE}/${announcement.id}`).set(bearer(hrAdmin)).expect(200);
    await request(app).get(`${BASE}/${announcement.id}`).set(bearer(employee)).expect(404);
    await request(app).delete(`${BASE}/${announcement.id}`).set(bearer(hrAdmin)).expect(404);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: announcement.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });

    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        AuditAction.ANNOUNCEMENT_CREATE,
        AuditAction.ANNOUNCEMENT_UPDATE,
        AuditAction.ANNOUNCEMENT_DELETE,
      ]),
    );
  });
});
