import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createDesignationController,
  deleteDesignationController,
  getDesignationController,
  listDesignationsController,
  updateDesignationController,
} from './designations.controller';
import {
  createDesignationSchema,
  designationIdParamSchema,
  listDesignationsQuerySchema,
  updateDesignationSchema,
} from './designations.validator';

export const designationsRouter = Router();

designationsRouter.use(authenticate);

designationsRouter.get(
  '/',
  requirePermission(PERMISSIONS.DESIGNATION_READ, PERMISSIONS.DESIGNATION_MANAGE),
  validate({ query: listDesignationsQuerySchema }),
  listDesignationsController,
);

designationsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DESIGNATION_MANAGE),
  validate({ body: createDesignationSchema }),
  createDesignationController,
);

designationsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.DESIGNATION_READ, PERMISSIONS.DESIGNATION_MANAGE),
  validate({ params: designationIdParamSchema }),
  getDesignationController,
);

designationsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.DESIGNATION_MANAGE),
  validate({ params: designationIdParamSchema, body: updateDesignationSchema }),
  updateDesignationController,
);

designationsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.DESIGNATION_MANAGE),
  validate({ params: designationIdParamSchema }),
  deleteDesignationController,
);
