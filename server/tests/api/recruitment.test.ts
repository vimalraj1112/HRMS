import { randomUUID } from 'node:crypto';
import { AuditAction } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { errorHandler, notFoundHandler } from '../../src/middleware/error.middleware';
import { recruitmentRouter } from '../../src/modules/recruitment/recruitment.routes';
import { storage } from '../../src/services/storage.service';
import { ACCOUNTS, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

/**
 * The recruitment router is mounted on its own app because the shared router
 * file is owned by the wiring manifest and is not edited here. Everything below
 * the mount point (auth, validation, error handling) is identical to production.
 */
const recruitmentApp = express();
recruitmentApp.use(express.json({ limit: '1mb' }));
recruitmentApp.use(express.urlencoded({ extended: true, limit: '1mb' }));
recruitmentApp.use('/api/v1/recruitment', recruitmentRouter);
recruitmentApp.use(notFoundHandler);
recruitmentApp.use(errorHandler);

const api = () => request(recruitmentApp);

/** Reads the ids out of a list response body. */
function idsOf(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return (payload as Array<{ id: string }>).map((entry) => entry.id);
}

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const futureIso = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const pastIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('/api/v1/recruitment', () => {
  let hrAdmin: LoginResult;
  let hrManager: LoginResult;
  let recruiter: LoginResult;
  let employee: LoginResult;
  let manager: LoginResult;
  let interviewerId = '';

  const jobIds: string[] = [];
  const candidateIds: string[] = [];
  const interviewIds: string[] = [];
  const offerIds: string[] = [];
  const resumeKeys: string[] = [];

  const uid = randomUUID().replace(/-/g, '').slice(0, 12);
  const uniqueEmail = (label: string) => `${label}-${uid}@example.com`;

  let openJobId = '';
  let draftJobId = '';

  beforeAll(async () => {
    [hrAdmin, hrManager, recruiter, employee, manager] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.hrManager),
      login(ACCOUNTS.recruiter),
      login(ACCOUNTS.employee),
      login(ACCOUNTS.manager),
    ]);

    interviewerId = recruiter.employeeId ?? '';
    expect(interviewerId).not.toBe('');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { entityType: 'Interview', entityId: { in: interviewIds } },
    });
    await prisma.notification.deleteMany({ where: { entityType: 'Offer', entityId: { in: offerIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    await prisma.jobOpening.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.auditLog.deleteMany({
      where: { entity: { in: ['JobOpening', 'Candidate', 'Interview', 'Offer'] }, entityId: { in: [...jobIds, ...candidateIds, ...interviewIds, ...offerIds] } },
    });
    await Promise.all(resumeKeys.map((key) => storage().remove(key).catch(() => undefined)));
  });

  describe('access control', () => {
    it('rejects an unauthenticated request', async () => {
      await api().get('/api/v1/recruitment/jobs').expect(401);
    });

    it('forbids an employee from every recruitment resource', async () => {
      await api().get('/api/v1/recruitment/jobs').set(bearer(employee)).expect(403);
      await api().get('/api/v1/recruitment/candidates').set(bearer(employee)).expect(403);
      await api().get('/api/v1/recruitment/interviews').set(bearer(employee)).expect(403);
      await api().get('/api/v1/recruitment/offers').set(bearer(employee)).expect(403);
      await api()
        .post('/api/v1/recruitment/jobs')
        .set(bearer(employee))
        .send({ title: 'Nope', description: 'Nope' })
        .expect(403);
    });

    it('lets HR read the recruitment queues', async () => {
      const response = await api().get('/api/v1/recruitment/jobs').set(bearer(hrAdmin)).expect(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('total');
    });
  });

  describe('job openings', () => {
    it('creates a draft job opening', async () => {
      const response = await api()
        .post('/api/v1/recruitment/jobs')
        .set(bearer(recruiter))
        .send({
          title: 'Backend Engineer',
          description: 'Design and ship REST APIs.',
          openingsCount: 2,
          employmentType: 'FULL_TIME',
          location: 'Bengaluru',
        })
        .expect(201);

      expect(response.body.data.status).toBe('DRAFT');
      expect(response.body.data.salaryMin).toBeNull();
      openJobId = response.body.data.id;
      jobIds.push(openJobId);

      const audit = await prisma.auditLog.findFirst({
        where: { action: AuditAction.JOB_CREATE, entityId: openJobId },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects a title that is too short', async () => {
      const response = await api()
        .post('/api/v1/recruitment/jobs')
        .set(bearer(recruiter))
        .send({ title: 'x', description: 'Too short' })
        .expect(400);

      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('refuses to open a job without a publish date', async () => {
      const response = await api()
        .patch(`/api/v1/recruitment/jobs/${openJobId}`)
        .set(bearer(recruiter))
        .send({ status: 'OPEN' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('publishes, lists and closes the opening', async () => {
      await api()
        .patch(`/api/v1/recruitment/jobs/${openJobId}`)
        .set(bearer(recruiter))
        .send({ status: 'OPEN', publishedAt: pastIso(1) })
        .expect(200);

      const open = await api()
        .get(`/api/v1/recruitment/jobs?status=OPEN&search=Backend`)
        .set(bearer(recruiter))
        .expect(200);
      expect(idsOf(open.body.data)).toContain(openJobId);

      const closed = await api()
        .patch(`/api/v1/recruitment/jobs/${openJobId}`)
        .set(bearer(recruiter))
        .send({ status: 'CLOSED' })
        .expect(200);
      expect(closed.body.data.status).toBe('CLOSED');
      expect(closed.body.data.closedAt).not.toBeNull();

      const missing = await api()
        .get(`/api/v1/recruitment/jobs?status=OPEN&search=Backend`)
        .set(bearer(recruiter))
        .expect(200);
      expect(idsOf(missing.body.data)).not.toContain(openJobId);
    });

    it('rejects an illegal status transition', async () => {
      const created = await api()
        .post('/api/v1/recruitment/jobs')
        .set(bearer(recruiter))
        .send({ title: 'QA Engineer', description: 'Manual and automated testing.' })
        .expect(201);
      draftJobId = created.body.data.id;
      jobIds.push(draftJobId);

      const response = await api()
        .patch(`/api/v1/recruitment/jobs/${draftJobId}`)
        .set(bearer(recruiter))
        .send({ status: 'CLOSED' })
        .expect(409);

      expect(response.body.message).toContain('DRAFT');
    });

    it('returns 404 for an unknown job', async () => {
      await api()
        .get(`/api/v1/recruitment/jobs/${randomUUID()}`)
        .set(bearer(recruiter))
        .expect(404);
    });
  });

  describe('candidates', () => {
    let candidateId = '';
    let hiredId = '';
    let disposableId = '';

    const baseBody = (label: string) => ({
      firstName: 'Priya',
      lastName: 'Nair',
      email: uniqueEmail(label),
      phone: '+91 9876543210',
      jobOpeningId: openJobId,
      currentCompany: 'Acme',
      experienceYears: 5,
      expectedSalary: 1800000,
      source: 'Referral',
    });

    it('creates a candidate and rejects a duplicate email', async () => {
      const created = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send(baseBody('cand'))
        .expect(201);

      expect(created.body.data.status).toBe('APPLIED');
      expect(created.body.data.hasResume).toBe(false);
      expect(created.body.data.experienceYears).toBe(5);
      candidateId = created.body.data.id;
      candidateIds.push(candidateId);

      const duplicate = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({ ...baseBody('cand'), firstName: 'Someone', lastName: 'Else' })
        .expect(409);

      expect(duplicate.body.success).toBe(false);
    });

    it('reports a missing reference as unprocessable', async () => {
      const response = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({ ...baseBody('badref'), jobOpeningId: randomUUID() })
        .expect(422);

      expect(response.body.message).toContain('job opening');
    });

    it('lists and searches candidates for a job', async () => {
      const response = await api()
        .get(`/api/v1/recruitment/candidates?jobOpeningId=${openJobId}&search=Priya`)
        .set(bearer(recruiter))
        .expect(200);

      expect(idsOf(response.body.data)).toContain(candidateId);
      expect(response.body.meta).toHaveProperty('totalPages');
    });

    it('returns a candidate with interviews and offers', async () => {
      const response = await api()
        .get(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .expect(200);

      expect(response.body.data.id).toBe(candidateId);
      expect(response.body.data.interviews).toEqual([]);
      expect(response.body.data.offers).toEqual([]);
      expect(response.body.data.jobOpening.id).toBe(openJobId);
    });

    it('requires a rejection reason', async () => {
      for (const status of ['SCREENING', 'INTERVIEW']) {
        await api()
          .patch(`/api/v1/recruitment/candidates/${candidateId}`)
          .set(bearer(recruiter))
          .send({ status })
          .expect(200);
      }

      const missingReason = await api()
        .patch(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .send({ status: 'REJECTED' })
        .expect(422);

      expect(missingReason.body.message).toContain('rejection reason');

      const rejected = await api()
        .patch(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .send({ status: 'REJECTED', rejectionReason: 'Skill mismatch' })
        .expect(200);

      expect(rejected.body.data.status).toBe('REJECTED');
      expect(rejected.body.data.rejectionReason).toBe('Skill mismatch');

      const terminal = await api()
        .patch(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .send({ status: 'WITHDRAWN' })
        .expect(409);

      expect(terminal.body.message).toContain('REJECTED');
    });

    it('blocks illegal transitions and hires through a linked employee', async () => {
      const created = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({ ...baseBody('hired'), firstName: 'Arjun', lastName: 'Patel' })
        .expect(201);
      hiredId = created.body.data.id;
      candidateIds.push(hiredId);

      const skipStage = await api()
        .patch(`/api/v1/recruitment/candidates/${hiredId}`)
        .set(bearer(recruiter))
        .send({ status: 'HIRED' })
        .expect(409);
      expect(skipStage.body.message).toContain('APPLIED');

      for (const status of ['SCREENING', 'INTERVIEW', 'SELECTED']) {
        await api()
          .patch(`/api/v1/recruitment/candidates/${hiredId}`)
          .set(bearer(recruiter))
          .send({ status })
          .expect(200);
      }

      const noEmployee = await api()
        .patch(`/api/v1/recruitment/candidates/${hiredId}`)
        .set(bearer(recruiter))
        .send({ status: 'HIRED' })
        .expect(422);
      expect(noEmployee.body.message).toContain('employee');

      const hired = await api()
        .patch(`/api/v1/recruitment/candidates/${hiredId}`)
        .set(bearer(recruiter))
        .send({ status: 'HIRED', employeeId: recruiter.employeeId })
        .expect(200);

      expect(hired.body.data.status).toBe('HIRED');
      expect(hired.body.data.hiredEmployee.id).toBe(recruiter.employeeId);
    });

    it('handles the resume lifecycle', async () => {
      const noFile = await api()
        .post(`/api/v1/recruitment/candidates/${candidateId}/resume`)
        .set(bearer(recruiter))
        .expect(400);
      expect(noFile.body.message).toContain('resume');

      const uploaded = await api()
        .post(`/api/v1/recruitment/candidates/${candidateId}/resume`)
        .set(bearer(recruiter))
        .attach('file', PNG_BYTES, { filename: 'resume.png', contentType: 'image/png' })
        .expect(200);

      expect(uploaded.body.data.hasResume).toBe(true);
      expect(uploaded.body.data.resumeFileName).toBe('resume.png');
      const resumeKey = `candidates/${candidateId}/${candidateId}.png`;
      resumeKeys.push(resumeKey);

      const download = await api()
        .get(`/api/v1/recruitment/candidates/${candidateId}/resume`)
        .set(bearer(recruiter))
        .expect(200);

      expect(download.headers['content-type']).toContain('image/png');
      expect(download.headers['content-disposition']).toContain('resume.png');
      expect(download.body.length).toBeGreaterThan(0);

      const missing = await api()
        .get(`/api/v1/recruitment/candidates/${hiredId}/resume`)
        .set(bearer(recruiter))
        .expect(404);
      expect(missing.body.message).toContain('No resume');
    });

    it('deletes a candidate', async () => {
      const created = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({ ...baseBody('temp'), firstName: 'Temp', lastName: 'Candidate' })
        .expect(201);
      disposableId = created.body.data.id;
      candidateIds.push(disposableId);

      await api()
        .delete(`/api/v1/recruitment/candidates/${disposableId}`)
        .set(bearer(recruiter))
        .expect(200);

      await api()
        .get(`/api/v1/recruitment/candidates/${disposableId}`)
        .set(bearer(recruiter))
        .expect(404);
    });

    it('refuses to delete a job that has candidates', async () => {
      const response = await api()
        .delete(`/api/v1/recruitment/jobs/${openJobId}`)
        .set(bearer(recruiter))
        .expect(409);

      expect(response.body.message).toContain('candidate');
    });

    it('deletes a job without candidates', async () => {
      await api()
        .delete(`/api/v1/recruitment/jobs/${draftJobId}`)
        .set(bearer(recruiter))
        .expect(200);

      await api()
        .get(`/api/v1/recruitment/jobs/${draftJobId}`)
        .set(bearer(recruiter))
        .expect(404);
    });
  });

  describe('interviews', () => {
    let candidateId = '';
    let interviewId = '';
    let secondInterviewId = '';

    beforeAll(async () => {
      const created = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({
          firstName: 'Vikram',
          lastName: 'Rao',
          email: uniqueEmail('interview'),
          source: 'Careers page',
        })
        .expect(201);
      candidateId = created.body.data.id;
      candidateIds.push(candidateId);
    });

    it('schedules an interview and moves the candidate onto the interview stage', async () => {
      const response = await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({
          candidateId,
          interviewerId,
          round: 1,
          scheduledAt: futureIso(2),
          mode: 'VIDEO',
          durationMinutes: 45,
          locationOrLink: 'https://meet.example.com/x',
        })
        .expect(201);

      expect(response.body.data.status).toBe('SCHEDULED');
      expect(response.body.data.candidate.id).toBe(candidateId);
      interviewId = response.body.data.id;
      interviewIds.push(interviewId);

      const candidate = await api()
        .get(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .expect(200);
      expect(candidate.body.data.status).toBe('INTERVIEW');

      const notification = await prisma.notification.findFirst({
        where: { entityType: 'Interview', entityId: interviewId },
      });
      expect(notification).not.toBeNull();
    });

    it('validates scheduling inputs', async () => {
      await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({ candidateId, interviewerId, scheduledAt: pastIso(1) })
        .expect(422);

      await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({ candidateId, interviewerId: randomUUID(), scheduledAt: futureIso(1) })
        .expect(422);

      await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({ candidateId: randomUUID(), interviewerId, scheduledAt: futureIso(1) })
        .expect(422);

      const badRound = await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({ candidateId, interviewerId, round: 0, scheduledAt: futureIso(1) })
        .expect(400);
      expect(badRound.body.errors.length).toBeGreaterThan(0);
    });

    it('accepts feedback once and only once', async () => {
      const response = await api()
        .post(`/api/v1/recruitment/interviews/${interviewId}/feedback`)
        .set(bearer(manager))
        .send({ rating: 4, recommendation: 'HIRE', feedback: 'Strong fundamentals.' })
        .expect(200);

      expect(response.body.data.status).toBe('COMPLETED');
      expect(response.body.data.feedbackAt).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: AuditAction.INTERVIEW_FEEDBACK, entityId: interviewId },
      });
      expect(audit).not.toBeNull();

      const again = await api()
        .post(`/api/v1/recruitment/interviews/${interviewId}/feedback`)
        .set(bearer(manager))
        .send({ rating: 2, recommendation: 'NO_HIRE' })
        .expect(409);
      expect(again.body.message).toContain('already been submitted');
    });

    it('validates feedback payloads and permissions', async () => {
      await api()
        .post(`/api/v1/recruitment/interviews/${interviewId}/feedback`)
        .set(bearer(hrAdmin))
        .send({ rating: 6, recommendation: 'HIRE' })
        .expect(400);

      await api()
        .post(`/api/v1/recruitment/interviews/${interviewId}/feedback`)
        .set(bearer(employee))
        .send({ rating: 3, recommendation: 'HIRE' })
        .expect(403);

      await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(employee))
        .send({ candidateId, interviewerId, scheduledAt: futureIso(3) })
        .expect(403);
    });

    it('reschedules, cancels and refuses to cancel completed work', async () => {
      const second = await api()
        .post('/api/v1/recruitment/interviews')
        .set(bearer(recruiter))
        .send({ candidateId, interviewerId, round: 2, scheduledAt: futureIso(3) })
        .expect(201);
      secondInterviewId = second.body.data.id;
      interviewIds.push(secondInterviewId);

      await api()
        .patch(`/api/v1/recruitment/interviews/${secondInterviewId}`)
        .set(bearer(recruiter))
        .send({ scheduledAt: pastIso(1) })
        .expect(422);

      const rescheduled = await api()
        .patch(`/api/v1/recruitment/interviews/${secondInterviewId}`)
        .set(bearer(recruiter))
        .send({ scheduledAt: futureIso(5), mode: 'PHONE' })
        .expect(200);
      expect(rescheduled.body.data.mode).toBe('PHONE');

      await api()
        .patch(`/api/v1/recruitment/interviews/${secondInterviewId}`)
        .set(bearer(recruiter))
        .send({ status: 'CANCELLED' })
        .expect(200);

      const idempotent = await api()
        .patch(`/api/v1/recruitment/interviews/${secondInterviewId}`)
        .set(bearer(recruiter))
        .send({ status: 'CANCELLED' })
        .expect(200);
      expect(idempotent.body.data.status).toBe('CANCELLED');

      const reopen = await api()
        .patch(`/api/v1/recruitment/interviews/${secondInterviewId}`)
        .set(bearer(recruiter))
        .send({ status: 'COMPLETED' })
        .expect(409);
      expect(reopen.body.message).toContain('CANCELLED');

      const completed = await api()
        .patch(`/api/v1/recruitment/interviews/${interviewId}`)
        .set(bearer(recruiter))
        .send({ status: 'CANCELLED' })
        .expect(409);
      expect(completed.body.message).toContain('COMPLETED');
    });
  });

  describe('offers', () => {
    let candidateId = '';
    let offerId = '';
    let secondOfferId = '';

    beforeAll(async () => {
      const created = await api()
        .post('/api/v1/recruitment/candidates')
        .set(bearer(recruiter))
        .send({ firstName: 'Neha', lastName: 'Gupta', email: uniqueEmail('offer') })
        .expect(201);
      candidateId = created.body.data.id;
      candidateIds.push(candidateId);

      for (const status of ['SCREENING', 'INTERVIEW']) {
        await api()
          .patch(`/api/v1/recruitment/candidates/${candidateId}`)
          .set(bearer(recruiter))
          .send({ status })
          .expect(200);
      }
    });

    it('forbids roles without offer rights', async () => {
      await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(hrManager))
        .send({ candidateId, annualCtc: 1000000 })
        .expect(403);

      await api()
        .post(`/api/v1/recruitment/offers/${randomUUID()}/respond`)
        .set(bearer(employee))
        .send({ status: 'ACCEPTED' })
        .expect(403);
    });

    it('validates offer payloads and references', async () => {
      await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(recruiter))
        .send({ candidateId, annualCtc: 0 })
        .expect(400);

      await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(recruiter))
        .send({ candidateId: randomUUID(), annualCtc: 1000000 })
        .expect(422);
    });

    it('creates one open offer per candidate', async () => {
      const created = await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(recruiter))
        .send({ candidateId, annualCtc: 2400000, joiningDate: futureIso(20).slice(0, 10), notes: 'Offer for the role' })
        .expect(201);

      expect(created.body.data.status).toBe('DRAFT');
      expect(created.body.data.annualCtc).toBe(2400000);
      offerId = created.body.data.id;
      offerIds.push(offerId);

      const duplicate = await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(recruiter))
        .send({ candidateId, annualCtc: 2000000 })
        .expect(409);
      expect(duplicate.body.message).toContain('open offer');
    });

    it('extends the offer and moves the candidate to the offer stage', async () => {
      const noExpiry = await api()
        .patch(`/api/v1/recruitment/offers/${offerId}`)
        .set(bearer(recruiter))
        .send({ status: 'EXTENDED' })
        .expect(422);
      expect(noExpiry.body.message).toContain('expiry');

      const extended = await api()
        .patch(`/api/v1/recruitment/offers/${offerId}`)
        .set(bearer(recruiter))
        .send({ status: 'EXTENDED', expiresAt: futureIso(7) })
        .expect(200);
      expect(extended.body.data.status).toBe('EXTENDED');
      expect(extended.body.data.issuedAt).not.toBeNull();

      const candidate = await api()
        .get(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .expect(200);
      expect(candidate.body.data.status).toBe('OFFERED');

      const direct = await api()
        .patch(`/api/v1/recruitment/offers/${offerId}`)
        .set(bearer(recruiter))
        .send({ status: 'ACCEPTED' })
        .expect(409);
      expect(direct.body.message).toContain('respond');
    });

    it('records an acceptance and closes the candidate', async () => {
      const response = await api()
        .post(`/api/v1/recruitment/offers/${offerId}/respond`)
        .set(bearer(recruiter))
        .send({ status: 'ACCEPTED' })
        .expect(200);

      expect(response.body.data.status).toBe('ACCEPTED');
      expect(response.body.data.respondedAt).not.toBeNull();
      expect(response.body.data.candidateOutcome).toBe('HIRED');

      const candidate = await api()
        .get(`/api/v1/recruitment/candidates/${candidateId}`)
        .set(bearer(recruiter))
        .expect(200);
      expect(candidate.body.data.status).toBe('HIRED');

      const repeat = await api()
        .post(`/api/v1/recruitment/offers/${offerId}/respond`)
        .set(bearer(recruiter))
        .send({ status: 'REJECTED' })
        .expect(409);
      expect(repeat.body.message).toContain('extended offer');
    });

    it('expires an offer only after its expiry date', async () => {
      const created = await api()
        .post('/api/v1/recruitment/offers')
        .set(bearer(recruiter))
        .send({ candidateId, annualCtc: 2100000, expiresAt: futureIso(3) })
        .expect(201);
      secondOfferId = created.body.data.id;
      offerIds.push(secondOfferId);

      await api()
        .patch(`/api/v1/recruitment/offers/${secondOfferId}`)
        .set(bearer(recruiter))
        .send({ status: 'EXTENDED' })
        .expect(200);

      const tooEarly = await api()
        .patch(`/api/v1/recruitment/offers/${secondOfferId}`)
        .set(bearer(recruiter))
        .send({ status: 'EXPIRED' })
        .expect(409);
      expect(tooEarly.body.message).toContain('expiry');

      const expired = await api()
        .patch(`/api/v1/recruitment/offers/${secondOfferId}`)
        .set(bearer(recruiter))
        .send({ status: 'EXPIRED', expiresAt: pastIso(1) })
        .expect(200);
      expect(expired.body.data.status).toBe('EXPIRED');
    });

    it('lists offers with pagination metadata', async () => {
      const response = await api()
        .get(`/api/v1/recruitment/offers?candidateId=${candidateId}`)
        .set(bearer(hrAdmin))
        .expect(200);

      expect(idsOf(response.body.data)).toContain(offerId);
      expect(response.body.meta.total).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0].annualCtc).toBeTypeOf('number');
    });
  });
});
