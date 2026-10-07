import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { performanceRouter } from '../../src/modules/performance/performance.routes';
import { v1Router } from '../../src/routes';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

// The wiring manifest mounts this router in routes/index.ts; mounting it here too
// keeps the suite runnable before that edit exists and is a no-op afterwards
// (the first matching mount answers the request).
v1Router.use('/performance', performanceRouter);

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });
const BASE = '/api/v1/performance';

interface GoalRow {
  id: string;
  employeeId: string;
  title: string;
  type: string;
  status: string;
  weight: number;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  kpis: Array<{ id: string; title: string; targetValue: number; currentValue: number; weight: number; achieved: boolean }>;
}

interface ReviewRow {
  id: string;
  employeeId: string;
  reviewerId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  selfRating: number | null;
  managerRating: number | null;
  overallRating: number | null;
  status: string;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  employeeComments: string | null;
}

describe('/api/v1/performance', () => {
  let hrAdmin: LoginResult;
  let manager: LoginResult;
  let employee: LoginResult;
  let outsider: LoginResult;
  let employeeId: string;
  let managerId: string;
  let outsiderId: string;
  const createdGoalIds: string[] = [];
  const createdReviewIds: string[] = [];

  beforeAll(async () => {
    [hrAdmin, manager, employee, outsider] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.manager),
      login(ACCOUNTS.employee),
      login(ACCOUNTS.finance),
    ]);

    employeeId = employee.employeeId ?? '';
    managerId = manager.employeeId ?? '';
    outsiderId = outsider.employeeId ?? '';
    expect(employeeId).not.toBe('');
    expect(managerId).not.toBe('');
    expect(outsiderId).not.toBe('');
  });

  afterAll(async () => {
    await prisma.performanceReview.deleteMany({ where: { id: { in: createdReviewIds } } });
    await prisma.goal.deleteMany({ where: { id: { in: createdGoalIds } } });
    await prisma.notification.deleteMany({
      where: { entityId: { in: [...createdGoalIds, ...createdReviewIds] } },
    });
  });

  async function createGoal(session: LoginResult, body: Record<string, unknown>, expected = 201): Promise<GoalRow> {
    const response = await request(app).post(`${BASE}/goals`).set(bearer(session)).send(body).expect(expected);
    if (expected === 201) createdGoalIds.push(response.body.data.id as string);
    return response.body.data as GoalRow;
  }

  async function createReview(session: LoginResult, body: Record<string, unknown>, expected = 201): Promise<ReviewRow> {
    const response = await request(app).post(`${BASE}/reviews`).set(bearer(session)).send(body).expect(expected);
    if (expected === 201) createdReviewIds.push(response.body.data.id as string);
    return response.body.data as ReviewRow;
  }

  const defaultPeriod = { periodStart: '2026-01-01', periodEnd: '2026-03-31' };

  it('rejects unauthenticated requests', async () => {
    await request(app).get(`${BASE}/goals`).expect(401);
    await request(app).get(`${BASE}/reviews`).expect(401);
    await request(app).post(`${BASE}/goals`).send({ title: 'No session' }).expect(401);
  });

  it('rejects a malformed goal id instead of reaching the database', async () => {
    await request(app).get(`${BASE}/goals/not-a-uuid`).set(bearer(employee)).expect(400);
  });

  // ── Goals ─────────────────────────────────────────────────────
  it('lets an employee create a goal for themselves with KPIs', async () => {
    const goal = await createGoal(employee, {
      title: 'Ship performance module',
      description: 'Deliver goals, KPIs and reviews',
      type: 'KPI',
      weight: 40,
      startDate: '2026-01-01',
      dueDate: '2026-03-31',
      kpis: [
        { title: 'Open PRs merged', targetValue: 20, unit: 'PRs', weight: 60 },
        { title: 'Incidents resolved', targetValue: 5, unit: 'tickets', weight: 40 },
      ],
    });

    expect(goal.employeeId).toBe(employeeId);
    expect(goal.status).toBe('NOT_STARTED');
    expect(goal.progress).toBe(0);
    expect(goal.startDate).toBe('2026-01-01');
    expect(goal.dueDate).toBe('2026-03-31');
    expect(goal.kpis).toHaveLength(2);
    expect(goal.kpis[0]?.targetValue).toBe(20);
    expect(goal.kpis[0]?.currentValue).toBe(0);
    expect(goal.kpis.every((kpi) => kpi.achieved === false)).toBe(true);
  });

  it('rejects a due date before the start date', async () => {
    await createGoal(
      employee,
      { title: 'Backwards window', startDate: '2026-05-01', dueDate: '2026-04-01' },
      422,
    );
  });

  it('rejects KPI weights that exceed the 100 point budget', async () => {
    await createGoal(
      employee,
      {
        title: 'Over budget KPIs',
        kpis: [
          { title: 'Alpha', targetValue: 10, weight: 60 },
          { title: 'Beta', targetValue: 10, weight: 60 },
        ],
      },
      422,
    );
  });

  it('stops an employee creating a goal for somebody else', async () => {
    await createGoal(employee, { title: 'Assigned upwards', employeeId: managerId }, 403);
  });

  it('stops a finance user creating a goal outside their scope', async () => {
    await createGoal(outsider, { title: 'Not mine to set', employeeId: employeeId }, 403);
  });

  it('lets a manager create a goal for a direct report and notifies them', async () => {
    const goal = await createGoal(manager, {
      title: 'Reduce support escalations',
      employeeId,
      type: 'PROJECT',
      weight: 30,
      dueDate: '2026-06-30',
    });

    expect(goal.employeeId).toBe(employeeId);

    const notification = await prisma.notification.findFirst({
      where: { entityType: 'Goal', entityId: goal.id, userId: employee.userId },
      select: { title: true },
    });
    expect(notification).toBeTruthy();
    expect(notification?.title).toContain('Reduce support escalations');
  });

  it('scopes the goal list to yourself when you are not a manager', async () => {
    const response = await request(app).get(`${BASE}/goals?limit=100`).set(bearer(employee)).expect(200);
    const rows = response.body.data as GoalRow[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.employeeId).toBe(employeeId);
  });

  it('lets a manager see their own goals and their reports goals', async () => {
    const response = await request(app).get(`${BASE}/goals?limit=100`).set(bearer(manager)).expect(200);
    const rows = response.body.data as GoalRow[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect([managerId, employeeId]).toContain(row.employeeId);
  });

  it('hides goals from unrelated accounts', async () => {
    const listed = await request(app).get(`${BASE}/goals?limit=100`).set(bearer(outsider)).expect(200);
    for (const row of listed.body.data as GoalRow[]) expect(row.employeeId).toBe(outsiderId);

    const visibleGoal = (await createGoal(employee, { title: 'Private objective' }));
    await request(app).get(`${BASE}/goals/${visibleGoal.id}`).set(bearer(outsider)).expect(403);
    await request(app).patch(`${BASE}/goals/${visibleGoal.id}`).set(bearer(outsider)).send({ progress: 50 }).expect(403);
  });

  it('completes a goal at 100 percent and reopens it when progress drops', async () => {
    const goal = await createGoal(employee, { title: 'Completion lifecycle' });

    const completed = await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({ progress: 100 })
      .expect(200);

    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.completedAt).toBeTruthy();

    const reopened = await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({ progress: 40 })
      .expect(200);

    expect(reopened.body.data.status).toBe('IN_PROGRESS');
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it('rejects an empty update and a KPI rewrite combined with KPI progress', async () => {
    const goal = await createGoal(employee, { title: 'Update guards' });

    await request(app).patch(`${BASE}/goals/${goal.id}`).set(bearer(employee)).send({}).expect(400);

    await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({
        kpis: [{ title: 'Replacement KPI', targetValue: 1, weight: 10 }],
        kpiProgress: [{ id: goal.kpis[0]?.id ?? '00000000-0000-0000-0000-000000000000', currentValue: 1 }],
      })
      .expect(400);
  });

  it('records KPI progress and marks a KPI achieved at its target', async () => {
    const goal = await createGoal(employee, {
      title: 'KPI progress',
      kpis: [{ title: 'Reviews closed', targetValue: 10, unit: 'reviews', weight: 100 }],
    });
    const kpiId = goal.kpis[0]?.id as string;

    const updated = await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({ kpiProgress: [{ id: kpiId, currentValue: 4 }] })
      .expect(200);

    expect((updated.body.data as GoalRow).kpis[0]?.currentValue).toBe(4);
    expect((updated.body.data as GoalRow).kpis[0]?.achieved).toBe(false);

    const achieved = await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({ kpiProgress: [{ id: kpiId, currentValue: 10 }] })
      .expect(200);

    expect((achieved.body.data as GoalRow).kpis[0]?.achieved).toBe(true);
  });

  it('rejects KPI progress for a KPI that belongs to another goal', async () => {
    const goal = await createGoal(employee, { title: 'Foreign KPI guard' });

    await request(app)
      .patch(`${BASE}/goals/${goal.id}`)
      .set(bearer(employee))
      .send({ kpiProgress: [{ id: '00000000-0000-4000-8000-000000000000', currentValue: 1 }] })
      .expect(422);
  });

  it('lets a manager delete a completed goal but stops the owner deleting theirs', async () => {
    const goal = await createGoal(employee, { title: 'Delete guard', progress: 100 });
    expect(goal.status).toBe('COMPLETED');

    await request(app).delete(`${BASE}/goals/${goal.id}`).set(bearer(employee)).expect(403);
    await request(app).delete(`${BASE}/goals/${goal.id}`).set(bearer(manager)).expect(200);
    await request(app).get(`${BASE}/goals/${goal.id}`).set(bearer(manager)).expect(404);

    const inFlight = await createGoal(employee, { title: 'Owner cleanup' });
    await request(app).delete(`${BASE}/goals/${inFlight.id}`).set(bearer(employee)).expect(200);
  });

  it('records audit entries for goal creation and updates', async () => {
    const goal = await createGoal(employee, { title: 'Audited goal' });
    await request(app).patch(`${BASE}/goals/${goal.id}`).set(bearer(employee)).send({ progress: 25 }).expect(200);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: goal.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });

    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([AuditAction.GOAL_CREATE, AuditAction.GOAL_UPDATE]),
    );
  });

  it('lets HR see every goal in the company', async () => {
    // The suite only ever assigns goals to one employee, so seed a second owner
    // to prove the HR view is not narrowed to a single person.
    await createGoal(manager, { title: 'Manager objective', employeeId: managerId });

    const response = await request(app).get(`${BASE}/goals?limit=100`).set(bearer(hrAdmin)).expect(200);
    const rows = response.body.data as GoalRow[];

    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.employeeId)).size).toBeGreaterThan(1);
  });

  // ── Performance reviews ───────────────────────────────────────
  it('stops an employee creating their own review', async () => {
    await createReview(employee, { employeeId, ...defaultPeriod }, 403);
  });

  it('lets a manager create a review for a direct report', async () => {
    const review = await createReview(manager, {
      employeeId,
      ...defaultPeriod,
      selfRating: 4,
      achievements: 'Shipped the payroll phase',
    });

    expect(review.employeeId).toBe(employeeId);
    expect(review.reviewerId).toBe(managerId);
    expect(review.period).toBe('QUARTERLY');
    expect(review.status).toBe('DRAFT');
    expect(review.selfRating).toBe(4);
    expect(review.overallRating).toBe(4);
    expect(review.periodStart).toBe('2026-01-01');
    expect(review.periodEnd).toBe('2026-03-31');
  });

  it('rejects a review period that is out of order', async () => {
    await createReview(manager, { employeeId, periodStart: '2026-04-01', periodEnd: '2026-04-01' }, 422);
    await createReview(manager, { employeeId, periodStart: '2026-05-01', periodEnd: '2026-04-01' }, 422);
  });

  it('stops a manager reviewing somebody outside their team', async () => {
    await createReview(manager, { employeeId: outsiderId, ...defaultPeriod }, 403);
  });

  it('scopes review lists to the parties involved', async () => {
    const asEmployee = await request(app).get(`${BASE}/reviews?limit=100`).set(bearer(employee)).expect(200);
    expect((asEmployee.body.data as ReviewRow[]).length).toBeGreaterThan(0);
    for (const row of asEmployee.body.data as ReviewRow[]) {
      expect(row.employeeId).toBe(employeeId);
    }

    const asManager = await request(app).get(`${BASE}/reviews?limit=100`).set(bearer(manager)).expect(200);
    expect((asManager.body.data as ReviewRow[]).length).toBeGreaterThan(0);
    for (const row of asManager.body.data as ReviewRow[]) {
      expect([employeeId, managerId]).toContain(row.employeeId);
    }

    const asOutsider = await request(app).get(`${BASE}/reviews?limit=100`).set(bearer(outsider)).expect(200);
    for (const row of asOutsider.body.data as ReviewRow[]) {
      expect(row.employeeId).not.toBe(employeeId);
    }
  });

  it('stops an unrelated account reading a review it is not part of', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod }));

    await request(app).get(`${BASE}/reviews/${review.id}`).set(bearer(employee)).expect(200);
    await request(app).get(`${BASE}/reviews/${review.id}`).set(bearer(outsider)).expect(403);
    await request(app).get(`${BASE}/reviews/not-a-uuid`).set(bearer(employee)).expect(400);
  });

  it('stops an employee editing review fields', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod }));

    await request(app)
      .patch(`${BASE}/reviews/${review.id}`)
      .set(bearer(employee))
      .send({ managerRating: 5 })
      .expect(403);
  });

  it('recomputes the overall rating from the manager and self ratings', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 4 }));

    const updated = await request(app)
      .patch(`${BASE}/reviews/${review.id}`)
      .set(bearer(manager))
      .send({ managerRating: 3.5 })
      .expect(200);

    const row = updated.body.data as ReviewRow;
    // 3.5 * 0.7 + 4 * 0.3 = 3.65
    expect(row.managerRating).toBe(3.5);
    expect(row.overallRating).toBe(3.65);
  });

  it('rejects ratings outside 0-5 or with more than two decimals', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod }));

    await request(app).patch(`${BASE}/reviews/${review.id}`).set(bearer(manager)).send({ managerRating: 6 }).expect(400);
    await request(app).patch(`${BASE}/reviews/${review.id}`).set(bearer(manager)).send({ managerRating: 3.555 }).expect(400);
  });

  it('refuses to submit a review that has no manager rating', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 3 }));

    await request(app).post(`${BASE}/reviews/${review.id}/submit`).set(bearer(manager)).expect(422);
    await request(app).post(`${BASE}/reviews/${review.id}/submit`).set(bearer(employee)).expect(403);
  });

  it('submits the review, recalculates the rating and notifies the employee', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 3 }));

    const submitted = await request(app)
      .post(`${BASE}/reviews/${review.id}/submit`)
      .set(bearer(manager))
      .send({ managerRating: 4.5, managerComments: 'Strong quarter' })
      .expect(200);

    const row = submitted.body.data as ReviewRow;
    expect(row.status).toBe('SUBMITTED');
    expect(row.submittedAt).toBeTruthy();
    expect(row.managerRating).toBe(4.5);
    // 4.5 * 0.7 + 3 * 0.3 = 4.05
    expect(row.overallRating).toBe(4.05);

    const notification = await prisma.notification.findFirst({
      where: { entityType: 'PerformanceReview', entityId: review.id, userId: employee.userId },
      select: { title: true },
    });
    expect(notification?.title).toContain('performance review');
  });

  it('refuses to submit the same review twice', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod }));

    await request(app)
      .post(`${BASE}/reviews/${review.id}/submit`)
      .set(bearer(manager))
      .send({ managerRating: 4 })
      .expect(200);
    await request(app).post(`${BASE}/reviews/${review.id}/submit`).set(bearer(manager)).expect(409);
  });

  it('refuses to acknowledge a review that is still in draft', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod }));

    // The subject gets past the identity check and is stopped by the status.
    await request(app).post(`${BASE}/reviews/${review.id}/acknowledge`).set(bearer(employee)).expect(409);
    // Somebody who is not the subject is refused before the status is examined.
    await request(app).post(`${BASE}/reviews/${review.id}/acknowledge`).set(bearer(outsider)).expect(403);
  });

  it('lets only the employee being reviewed acknowledge their review', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 4 }));
    await request(app)
      .post(`${BASE}/reviews/${review.id}/submit`)
      .set(bearer(manager))
      .send({ managerRating: 4 })
      .expect(200);

    // Neither the reviewer (without a manage permission) nor a bystander may acknowledge.
    await request(app).post(`${BASE}/reviews/${review.id}/acknowledge`).set(bearer(manager)).expect(403);
    await request(app).post(`${BASE}/reviews/${review.id}/acknowledge`).set(bearer(outsider)).expect(403);

    const acknowledged = await request(app)
      .post(`${BASE}/reviews/${review.id}/acknowledge`)
      .set(bearer(employee))
      .send({ employeeComments: 'Agreed' })
      .expect(200);

    const row = acknowledged.body.data as ReviewRow;
    expect(row.status).toBe('ACKNOWLEDGED');
    expect(row.acknowledgedAt).toBeTruthy();
    expect(row.employeeComments).toBe('Agreed');

    const notification = await prisma.notification.findFirst({
      where: { entityType: 'PerformanceReview', entityId: review.id, userId: manager.userId },
      select: { type: true },
    });
    expect(notification?.type).toBe('SUCCESS');
  });

  it('locks an acknowledged review against further edits', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 4 }));
    await request(app)
      .post(`${BASE}/reviews/${review.id}/submit`)
      .set(bearer(manager))
      .send({ managerRating: 4 })
      .expect(200);
    await request(app).post(`${BASE}/reviews/${review.id}/acknowledge`).set(bearer(employee)).expect(200);

    await request(app).patch(`${BASE}/reviews/${review.id}`).set(bearer(manager)).send({ managerRating: 1 }).expect(422);
    await request(app).post(`${BASE}/reviews/${review.id}/submit`).set(bearer(manager)).expect(409);
  });

  it('records audit entries for review creation, updates and submission', async () => {
    const review = (await createReview(manager, { employeeId, ...defaultPeriod, selfRating: 4 }));
    await request(app)
      .patch(`${BASE}/reviews/${review.id}`)
      .set(bearer(manager))
      .send({ managerRating: 4 })
      .expect(200);
    await request(app).post(`${BASE}/reviews/${review.id}/submit`).set(bearer(manager)).expect(200);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: review.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });

    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        AuditAction.PERFORMANCE_REVIEW_CREATE,
        AuditAction.PERFORMANCE_REVIEW_UPDATE,
        AuditAction.PERFORMANCE_REVIEW_SUBMIT,
      ]),
    );
  });
});
