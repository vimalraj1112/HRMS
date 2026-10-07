import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { uploadSingleFile } from '../../middleware/upload.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  deleteDocumentController,
  downloadDocumentController,
  getDocumentController,
  listDocumentsController,
  uploadDocumentController,
  verifyDocumentController,
} from './documents.controller';
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  uploadDocumentSchema,
  verifyDocumentSchema,
} from './documents.validator';

export const documentsRouter = Router();

documentsRouter.use(authenticate);

documentsRouter.get(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT_READ_OWN),
  validate({ query: listDocumentsQuerySchema }),
  listDocumentsController,
);

documentsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT_READ_OWN),
  validate({ params: documentIdParamSchema }),
  getDocumentController,
);

documentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT_UPLOAD),
  uploadSingleFile,
  validate({ body: uploadDocumentSchema }),
  uploadDocumentController,
);

documentsRouter.patch(
  '/:id/verify',
  requirePermission(PERMISSIONS.DOCUMENT_VERIFY),
  validate({ params: documentIdParamSchema, body: verifyDocumentSchema }),
  verifyDocumentController,
);

documentsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT_DELETE),
  validate({ params: documentIdParamSchema }),
  deleteDocumentController,
);

documentsRouter.get(
  '/:id/download',
  requirePermission(PERMISSIONS.DOCUMENT_READ_OWN),
  validate({ params: documentIdParamSchema }),
  downloadDocumentController,
);