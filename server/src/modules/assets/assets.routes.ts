import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  assignAssetController,
  createAssetController,
  deleteAssetController,
  getAssetController,
  getAssetHistoryController,
  getAssetStatsController,
  listAssetsController,
  listMyAssetHistoryController,
  returnAssetController,
  updateAssetController,
} from './assets.controller';
import {
  assetIdParamSchema,
  assignAssetSchema,
  createAssetSchema,
  listAssetsQuerySchema,
  myAssetsQuerySchema,
  returnAssetSchema,
  updateAssetSchema,
} from './assets.validator';

export const assetsRouter = Router();

assetsRouter.use(authenticate);

const canRead = requirePermission(PERMISSIONS.ASSET_READ_ANY, PERMISSIONS.ASSET_READ_OWN);
const canManage = requirePermission(PERMISSIONS.ASSET_MANAGE);

// Static paths must be declared before /:id so they are not parsed as ids.
assetsRouter.get('/', canRead, validate({ query: listAssetsQuerySchema }), listAssetsController);
assetsRouter.get('/stats', canRead, getAssetStatsController);
assetsRouter.get(
  '/my-history',
  requirePermission(PERMISSIONS.ASSET_READ_OWN),
  validate({ query: myAssetsQuerySchema }),
  listMyAssetHistoryController,
);

assetsRouter.post('/', canManage, validate({ body: createAssetSchema }), createAssetController);

assetsRouter.get('/:id', canRead, validate({ params: assetIdParamSchema }), getAssetController);
assetsRouter.patch(
  '/:id',
  canManage,
  validate({ params: assetIdParamSchema, body: updateAssetSchema }),
  updateAssetController,
);
assetsRouter.delete('/:id', canManage, validate({ params: assetIdParamSchema }), deleteAssetController);
assetsRouter.get(
  '/:id/history',
  canRead,
  validate({ params: assetIdParamSchema }),
  getAssetHistoryController,
);
assetsRouter.post(
  '/:id/assign',
  canManage,
  validate({ params: assetIdParamSchema, body: assignAssetSchema }),
  assignAssetController,
);
assetsRouter.post(
  '/:id/return',
  canManage,
  validate({ params: assetIdParamSchema, body: returnAssetSchema }),
  returnAssetController,
);
