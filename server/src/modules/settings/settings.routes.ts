import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  deleteSettingController,
  getSettingController,
  listSettingsController,
  updateSettingController,
} from './settings.controller';
import { settingKeyParamSchema, updateSettingSchema } from './settings.validator';

export const settingsRouter = Router();

settingsRouter.use(authenticate);

settingsRouter.get('/', listSettingsController);

settingsRouter.get('/:key', validate({ params: settingKeyParamSchema }), getSettingController);

settingsRouter.put(
  '/:key',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ params: settingKeyParamSchema, body: updateSettingSchema }),
  updateSettingController,
);

settingsRouter.delete(
  '/:key',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ params: settingKeyParamSchema }),
  deleteSettingController,
);
