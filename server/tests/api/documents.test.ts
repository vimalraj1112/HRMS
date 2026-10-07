import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { env } from '../../src/config/env';
import { storage } from '../../src/services/storage.service';
import { ACCOUNTS, app, login, type LoginResult } from '../helpers/testApp';

const bearer = (session: LoginResult) => ({ Authorization: `Bearer ${session.accessToken}` });

const TEST_ROOT = path.resolve(env.STORAGE_LOCAL_PATH);

/** A one pixel PNG, small enough to upload but still a real file. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const pngPath = path.resolve(env.STORAGE_LOCAL_PATH, 'test-upload.png');

function uploadPdf(session: LoginResult, employeeId: string, overrides: Record<string, string> = {}) {
  return request(app)
    .post('/api/v1/documents')
    .set(bearer(session))
    .field({ type: 'PAN', title: 'PAN Card', employeeId, ...overrides })
    .attach('file', pngPath, { filename: 'pan.png', contentType: 'image/png' });
}

describe('/api/v1/documents', () => {
  let hrAdmin: LoginResult;
  let employee: LoginResult;
  let otherEmployee: LoginResult;
  let employeeRecordId: string;
  let otherEmployeeRecordId: string;
  const uploadedIds: string[] = [];

  beforeAll(async () => {
    [hrAdmin, employee, otherEmployee] = await Promise.all([
      login(ACCOUNTS.hrAdmin),
      login(ACCOUNTS.employee),
      login(ACCOUNTS.manager),
    ]);

    employeeRecordId = employee.employeeId ?? '';
    otherEmployeeRecordId = otherEmployee.employeeId ?? '';
    expect(employeeRecordId).not.toBe('');
    expect(otherEmployeeRecordId).not.toBe('');

    // supertest needs a real file on disk to attach, and the storage root is
    // wiped between runs, so the fixture is written next to it.
    await mkdir(env.STORAGE_LOCAL_PATH, { recursive: true });
    await writeFile(pngPath, PNG_BYTES);

    await storage().put({ key: 'seed.pdf', body: PNG_BYTES });
    await prisma.employeeDocument.create({
      data: {
        employeeId: employeeRecordId,
        type: 'AADHAAR',
        title: 'Aadhaar Card',
        fileName: 'aadhaar.pdf',
        storageKey: 'seed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PNG_BYTES.byteLength,
      },
    });
  });

  afterAll(async () => {
    await prisma.employeeDocument.deleteMany({ where: { id: { in: uploadedIds } } });
    await prisma.employeeDocument.deleteMany({ where: { storageKey: 'seed.pdf' } });
    await storage().remove('seed.pdf');
    await rm(pngPath, { force: true });
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('rejects a request with no file attached', async () => {
    await request(app)
      .post('/api/v1/documents')
      .set(bearer(hrAdmin))
      .field({ type: 'PAN', title: 'PAN Card' })
      .expect(400);
  });

  it('rejects a disallowed file type', async () => {
    await request(app)
      .post('/api/v1/documents')
      .set(bearer(hrAdmin))
      .field({ type: 'PAN', title: 'PAN Card' })
      .attach('file', pngPath, { filename: 'payload.exe', contentType: 'application/x-msdownload' })
      .expect(400);
  });

  it('rejects a past expiry date', async () => {
    await uploadPdf(hrAdmin, employeeRecordId, { expiresAt: '2020-01-01' }).expect(422);
  });

  it('lets HR upload a document and stores the file under a generated key', async () => {
    const response = await uploadPdf(hrAdmin, employeeRecordId, { title: 'PAN Card' }).expect(201);

    const document = response.body.data;
    uploadedIds.push(document.id);

    expect(document.storageKey).toBe(`documents/${document.id}/${document.id}.png`);
    expect(document.fileName).toBe('pan.png');
    expect(document.mimeType).toBe('image/png');
    expect(document.sizeBytes).toBe(PNG_BYTES.byteLength);
    expect(document.isVerified).toBe(false);
    expect(document.expiresAt).toBeNull();
    expect(document.employee.employeeCode).toBeTruthy();

    // The real bytes must exist, not just a metadata row.
    expect(await storage().size(document.storageKey)).toBe(PNG_BYTES.byteLength);
  });

  it('lets an employee upload to their own record without an employeeId', async () => {
    const response = await request(app)
      .post('/api/v1/documents')
      .set(bearer(employee))
      .field({ type: 'EDUCATION_CERTIFICATE', title: 'Degree Certificate' })
      .attach('file', pngPath, { filename: 'degree.png', contentType: 'image/png' })
      .expect(201);

    expect(response.body.data.employeeId).toBe(employeeRecordId);
    uploadedIds.push(response.body.data.id);
  });

  it('stops an employee uploading to somebody else', async () => {
    await uploadPdf(employee, otherEmployeeRecordId).expect(403);
  });

  it('stops an unauthenticated request', async () => {
    await request(app).get('/api/v1/documents').expect(401);
  });

  it('only lists your own documents when you are not HR', async () => {
    const response = await request(app).get('/api/v1/documents').set(bearer(employee)).expect(200);

    expect(response.body.items.length).toBeGreaterThan(0);
    for (const document of response.body.items) {
      expect(document.employeeId).toBe(employeeRecordId);
    }
  });

  it('lets HR list documents for any employee and filter by type', async () => {
    const response = await request(app)
      .get(`/api/v1/documents?employeeId=${employeeRecordId}&type=PAN`)
      .set(bearer(hrAdmin))
      .expect(200);

    expect(response.body.items.length).toBeGreaterThan(0);
    for (const document of response.body.items) {
      expect(document.employeeId).toBe(employeeRecordId);
      expect(document.type).toBe('PAN');
    }
  });

  it('stops an employee reading another employee document', async () => {
    const documentId = (
      await request(app)
        .post('/api/v1/documents')
        .set(bearer(hrAdmin))
        .field({ type: 'ADDRESS_PROOF', title: 'Address Proof' })
        .attach('file', pngPath, { filename: 'address.png', contentType: 'image/png' })
        .expect(201)
    ).body.data.id as string;
    uploadedIds.push(documentId);

    await request(app).get(`/api/v1/documents/${documentId}`).set(bearer(otherEmployee)).expect(403);
    await request(app).get(`/api/v1/documents/${documentId}/download`).set(bearer(otherEmployee)).expect(403);
  });

  it('streams the file back to the owner with the original name', async () => {
    const created = await uploadPdf(hrAdmin, employeeRecordId, { title: 'Passport' }).expect(201);
    uploadedIds.push(created.body.data.id);

    const response = await request(app)
      .get(`/api/v1/documents/${created.body.data.id}/download`)
      .set(bearer(employee))
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['content-disposition']).toContain('pan.png');
  });

  it('records an audit entry for upload and download', async () => {
    const created = await uploadPdf(hrAdmin, employeeRecordId, { title: 'Bank Statement' }).expect(201);
    uploadedIds.push(created.body.data.id);

    await request(app)
      .get(`/api/v1/documents/${created.body.data.id}/download`)
      .set(bearer(hrAdmin))
      .expect(200);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: created.body.data.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });

    expect(actions.map((entry) => entry.action)).toContain(AuditAction.DOCUMENT_UPLOAD);
    expect(actions.map((entry) => entry.action)).toContain(AuditAction.DOCUMENT_DOWNLOAD);
  });

  it('lets HR verify and unverify a document', async () => {
    const created = await uploadPdf(hrAdmin, employeeRecordId, { title: 'Offer Letter' }).expect(201);
    const documentId = created.body.data.id as string;
    uploadedIds.push(documentId);

    const verified = await request(app)
      .patch(`/api/v1/documents/${documentId}/verify`)
      .set(bearer(hrAdmin))
      .send({ isVerified: true })
      .expect(200);

    expect(verified.body.data.isVerified).toBe(true);
    expect(verified.body.data.verifiedAt).toBeTruthy();

    const cleared = await request(app)
      .patch(`/api/v1/documents/${documentId}/verify`)
      .set(bearer(hrAdmin))
      .send({ isVerified: false })
      .expect(200);

    expect(cleared.body.data.isVerified).toBe(false);
    expect(cleared.body.data.verifiedAt).toBeNull();
    expect(cleared.body.data.verifiedById).toBeNull();
  });

  it('stops a non HR user from verifying a document', async () => {
    const created = await uploadPdf(employee, employeeRecordId).expect(201);
    uploadedIds.push(created.body.data.id);

    await request(app)
      .patch(`/api/v1/documents/${created.body.data.id}/verify`)
      .set(bearer(employee))
      .send({ isVerified: true })
      .expect(403);
  });

  it('notifies HR when an employee uploads and the employee when HR verifies', async () => {
    const created = await request(app)
      .post('/api/v1/documents')
      .set(bearer(employee))
      .field({ type: 'PAN', title: 'Self Uploaded PAN' })
      .attach('file', pngPath, { filename: 'self.png', contentType: 'image/png' })
      .expect(201);
    uploadedIds.push(created.body.data.id);

    const notifications = await prisma.notification.findMany({
      where: { entityType: 'EmployeeDocument', entityId: created.body.data.id },
      select: { userId: true, user: { select: { role: true, status: true } } },
    });

    expect(notifications.length).toBeGreaterThan(0);
    for (const notification of notifications) {
      expect(['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER']).toContain(notification.user.role);
    }

    // The uploader must not be handed their own review request.
    expect(notifications.some((n) => n.userId === employee.userId)).toBe(false);
  });

  it('notifies the employee when HR verifies their document', async () => {
    const created = await request(app)
      .post('/api/v1/documents')
      .set(bearer(employee))
      .field({ type: 'ADDRESS_PROOF', title: 'Address Proof Copy' })
      .attach('file', pngPath, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    uploadedIds.push(created.body.data.id);

    await request(app)
      .patch(`/api/v1/documents/${created.body.data.id}/verify`)
      .set(bearer(hrAdmin))
      .send({ isVerified: true })
      .expect(200);

    const employeeNotification = await prisma.notification.findFirst({
      where: {
        entityType: 'EmployeeDocument',
        entityId: created.body.data.id,
        userId: employee.userId,
      },
      select: { type: true, title: true },
    });

    expect(employeeNotification).toBeTruthy();
    expect(employeeNotification?.type).toBe('SUCCESS');
  });

  it('soft deletes a document, removes the file and hides it from reads', async () => {
    const created = await uploadPdf(hrAdmin, employeeRecordId, { title: 'Temp Receipt' }).expect(201);
    const documentId = created.body.data.id as string;
    const storageKey = created.body.data.storageKey as string;
    uploadedIds.push(documentId);

    await request(app).delete(`/api/v1/documents/${documentId}`).set(bearer(hrAdmin)).expect(200);

    expect(await storage().exists(storageKey)).toBe(false);
    await request(app).get(`/api/v1/documents/${documentId}`).set(bearer(hrAdmin)).expect(404);
    await request(app).get(`/api/v1/documents/${documentId}/download`).set(bearer(hrAdmin)).expect(404);

    // A second delete must not silently succeed on an already removed row.
    await request(app).delete(`/api/v1/documents/${documentId}`).set(bearer(hrAdmin)).expect(404);
  });

  it('filters by verification state and expiry window', async () => {
    const expiring = await uploadPdf(hrAdmin, employeeRecordId, {
      type: 'PASSPORT',
      title: 'Passport Copy',
      expiresAt: '2030-06-30',
    }).expect(201);
    uploadedIds.push(expiring.body.data.id);

    const verifiedResponse = await request(app)
      .get('/api/v1/documents?isVerified=false&employeeId=' + employeeRecordId)
      .set(bearer(hrAdmin))
      .expect(200);
    for (const document of verifiedResponse.body.items) {
      expect(document.isVerified).toBe(false);
    }

    const expiringResponse = (await request(app)
      .get('/api/v1/documents?expiringWithinDays=3650')
      .set(bearer(hrAdmin))
      .expect(200)) as { body: { items: { id: string }[] } };

    expect(expiringResponse.body.items.map((entry) => entry.id)).toContain(expiring.body.data.id);
  });

  it('rejects a malformed document id', async () => {
    await request(app).get('/api/v1/documents/not-a-uuid').set(bearer(hrAdmin)).expect(400);
  });
});