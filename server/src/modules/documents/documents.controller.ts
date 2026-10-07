import type { Request, Response } from 'express';
import { resolveEmployeeScope } from '../../middleware/rbac.middleware';
import { getRequestMeta } from '../../services/audit.service';
import { getParams, getQuery } from '../../utils/request';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import {
  deleteDocument,
  downloadDocument,
  getDocument,
  listDocuments,
  uploadDocument,
  verifyDocument,
} from './documents.service';
import type {
  ListDocumentsQuery,
  UploadDocumentBody,
  VerifyDocumentBody,
} from './documents.validator';

type Actor = { id: string; email: string; role: string; employeeId: string | null };

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

export async function listDocumentsController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const result = await listDocuments(getQuery<ListDocumentsQuery>(req), scope);
  res.json({ success: true, ...result });
}

export async function getDocumentController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const document = await getDocument(getParams<{ id: string }>(req).id, scope);
  sendSuccess(res, document, 'Document retrieved');
}

export async function uploadDocumentController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  const document = await uploadDocument(
    req.body as UploadDocumentBody,
    req.file,
    actorOf(req),
    scope,
    getRequestMeta(req),
  );
  sendCreated(res, document, 'Document uploaded');
}

export async function verifyDocumentController(req: Request, res: Response): Promise<void> {
  const document = await verifyDocument(
    getParams<{ id: string }>(req).id,
    req.validated?.body as VerifyDocumentBody,
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, document, document.isVerified ? 'Document verified' : 'Verification removed');
}

export async function deleteDocumentController(req: Request, res: Response): Promise<void> {
  const result = await deleteDocument(getParams<{ id: string }>(req).id, actorOf(req), getRequestMeta(req));
  sendSuccess(res, result, 'Document deleted');
}

export async function downloadDocumentController(req: Request, res: Response): Promise<void> {
  const scope = await resolveEmployeeScope(req);
  await downloadDocument(getParams<{ id: string }>(req).id, scope, actorOf(req), getRequestMeta(req), res);
}