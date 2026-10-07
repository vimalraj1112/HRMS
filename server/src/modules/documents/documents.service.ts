import { AuditAction, type Prisma } from '@prisma/client';
import type { Response } from 'express';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { assertEmployeeAccess } from '../../middleware/rbac.middleware';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { buildStorageKey, storage } from '../../services/storage.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { startOfUtcDay, toDateInputValue, toUtcDate } from '../../utils/workdays';
import { notifyEmployee, notifyRole } from '../notifications/notifications.service';
import type {
  ListDocumentsQuery,
  UploadDocumentBody,
  VerifyDocumentBody,
} from './documents.validator';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DOCUMENT_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  title: true,
  fileName: true,
  storageKey: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  uploadedAt: true,
  expiresAt: true,
  isVerified: true,
  verifiedById: true,
  verifiedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
    },
  },
  uploadedBy: { select: { email: true } },
  verifiedBy: { select: { email: true } },
} as const;

type Actor = { id: string; email: string; role: string; employeeId: string | null };

/** Upload rights follow read rights: anyone who can read a document may add one for that employee. */
function resolveTargetEmployee(actor: Actor, scope: EmployeeScope, requestedEmployeeId?: string): string {
  const target = requestedEmployeeId ?? actor.employeeId;
  if (!target) {
    throw ApiError.unprocessable('An employeeId is required because this account is not linked to an employee');
  }

  if (requestedEmployeeId && requestedEmployeeId === actor.employeeId) return target;

  assertEmployeeAccess(scope, target);
  if (!hasPermission(actor.role, PERMISSIONS.DOCUMENT_UPLOAD)) {
    throw ApiError.forbidden('You do not have permission to upload documents');
  }
  return target;
}

function serializeDocument<T extends { expiresAt: Date | null; deletedAt: Date | null }>(document: T) {
  return {
    ...document,
    expiresAt: document.expiresAt ? toDateInputValue(document.expiresAt) : null,
    deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
  };
}

export async function listDocuments(query: ListDocumentsQuery, scope: EmployeeScope) {
  const where: Prisma.EmployeeDocumentWhereInput = {
    ...(scope.mode === 'all' ? {} : { employeeId: { in: scope.employeeIds ?? [] } }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.isVerified === undefined ? {} : { isVerified: query.isVerified }),
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.expiringWithinDays === undefined
      ? {}
      : {
          expiresAt: {
            not: null,
            lte: new Date(startOfUtcDay(new Date()).getTime() + query.expiringWithinDays * ONE_DAY_MS),
          },
        }),
  };

  const [items, total] = await Promise.all([
    prisma.employeeDocument.findMany({
      where,
      select: DOCUMENT_SELECT,
      orderBy: [{ uploadedAt: query.sortOrder }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.employeeDocument.count({ where }),
  ]);

  return { items: items.map(serializeDocument), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getDocument(id: string, scope: EmployeeScope) {
  const document = await prisma.employeeDocument.findUnique({ where: { id }, select: DOCUMENT_SELECT });
  if (!document || document.deletedAt) throw ApiError.notFound('Document not found');

  assertEmployeeAccess(scope, document.employeeId);
  return serializeDocument(document);
}

export async function uploadDocument(
  body: UploadDocumentBody,
  file: Express.Multer.File | undefined,
  actor: Actor,
  scope: EmployeeScope,
  meta: RequestMeta,
) {
  if (!file) throw ApiError.badRequest('A file is required in the "file" field');

  const employeeId = resolveTargetEmployee(actor, scope, body.employeeId);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, firstName: true, lastName: true },
  });
  if (!employee) throw ApiError.notFound('Employee record not found');
  if (employee.status === 'TERMINATED') {
    throw ApiError.unprocessable('Documents cannot be uploaded for a terminated employee');
  }

  const expiresAt = body.expiresAt ? toUtcDate(body.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() < startOfUtcDay(new Date()).getTime()) {
    throw ApiError.unprocessable('The expiry date cannot be in the past');
  }

  // Reserve the row first so the storage key can include the document id.
  const created = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: body.type,
      title: body.title,
      fileName: file.originalname.slice(0, 255) || 'upload',
      storageKey: 'pending',
      mimeType: file.mimetype.toLowerCase(),
      sizeBytes: file.size,
      uploadedById: actor.id,
      ...(expiresAt ? { expiresAt } : {}),
    },
    select: { id: true },
  });

  const storageKey = buildStorageKey(created.id, file.mimetype.toLowerCase());

  try {
    await storage().put({ key: storageKey, body: file.buffer });
  } catch (error) {
    // Never leave a row pointing at a file that was never written.
    await prisma.employeeDocument.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }

  const document = await prisma.employeeDocument.update({
    where: { id: created.id },
    data: { storageKey },
    select: DOCUMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DOCUMENT_UPLOAD,
    entity: 'EmployeeDocument',
    entityId: document.id,
    meta,
    newValue: {
      employeeId,
      type: document.type,
      title: document.title,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
    },
  });

  if (employeeId !== actor.employeeId) {
    await notifyEmployee(employeeId, {
      type: 'INFO',
      title: `${document.title} added to your documents`,
      message: 'A document was added to your profile and is waiting for HR verification.',
      link: '/documents',
      entityType: 'EmployeeDocument',
      entityId: document.id,
    });
  } else {
    // A self upload needs an HR reviewer, so the queue goes to HR instead.
    await notifyRole(['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER'], {
      type: 'INFO',
      title: `${document.title} awaiting verification`,
      message: `${actor.email} uploaded a document that needs review.`,
      link: '/documents',
      entityType: 'EmployeeDocument',
      entityId: document.id,
    });
  }

  return serializeDocument(document);
}

export async function verifyDocument(
  id: string,
  body: VerifyDocumentBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.employeeDocument.findUnique({
    where: { id },
    select: { id: true, employeeId: true, isVerified: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw ApiError.notFound('Document not found');

  const document = await prisma.employeeDocument.update({
    where: { id },
    data: {
      isVerified: body.isVerified,
      verifiedById: body.isVerified ? actor.id : null,
      verifiedAt: body.isVerified ? new Date() : null,
    },
    select: DOCUMENT_SELECT,
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DOCUMENT_UPDATE,
    entity: 'EmployeeDocument',
    entityId: id,
    meta,
    oldValue: { isVerified: existing.isVerified },
    newValue: { isVerified: body.isVerified, remark: body.remark || undefined },
  });

  await notifyEmployee(document.employeeId, {
    type: body.isVerified ? 'SUCCESS' : 'WARNING',
    title: body.isVerified ? `${document.title} verified` : `${document.title} needs attention`,
    message: body.isVerified
      ? 'HR verified this document.'
      : body.remark || 'HR reopened this document for correction.',
    link: '/documents',
    entityType: 'EmployeeDocument',
    entityId: id,
  });

  return serializeDocument(document);
}

export async function deleteDocument(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.employeeDocument.findUnique({
    where: { id },
    select: { id: true, employeeId: true, storageKey: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw ApiError.notFound('Document not found');

  // Soft delete keeps the audit trail intact; the file is removed immediately.
  await prisma.employeeDocument.update({
    where: { id },
    data: { deletedAt: new Date(), isVerified: false, verifiedById: null, verifiedAt: null },
  });

  await storage().remove(existing.storageKey).catch(() => undefined);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DOCUMENT_DELETE,
    entity: 'EmployeeDocument',
    entityId: id,
    meta,
    oldValue: { employeeId: existing.employeeId },
  });

  return { id };
}

/**
 * Streams the stored file. The metadata row decides who may read it, so the
 * download is audited whether it comes from the UI or a direct link.
 */
export async function downloadDocument(id: string, scope: EmployeeScope, actor: Actor, meta: RequestMeta, res: Response) {
  const document = await prisma.employeeDocument.findUnique({ where: { id }, select: DOCUMENT_SELECT });
  if (!document || document.deletedAt) throw ApiError.notFound('Document not found');

  assertEmployeeAccess(scope, document.employeeId);

  const stream = await storage().readStream(document.storageKey);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.DOCUMENT_DOWNLOAD,
    entity: 'EmployeeDocument',
    entityId: id,
    meta,
  });

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', String(document.sizeBytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${document.fileName.replace(/[^\w.\- ]/g, '_')}"`,
  );
  stream.pipe(res);
}