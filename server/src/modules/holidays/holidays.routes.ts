import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createHolidayController,
  deleteHolidayController,
  getHolidayController,
  listHolidaysController,
  updateHolidayController,
} from './holidays.controller';
import {
  createHolidaySchema,
  holidayIdParamSchema,
  listHolidaysQuerySchema,
  updateHolidaySchema,
} from './holidays.validator';

export const holidaysRouter = Router();

holidaysRouter.use(authenticate);

holidaysRouter.get(
  '/',
  requirePermission(PERMISSIONS.HOLIDAY_READ),
  validate({ query: listHolidaysQuerySchema }),
  listHolidaysController,
);

holidaysRouter.post(
  '/',
  requirePermission(PERMISSIONS.HOLIDAY_MANAGE),
  validate({ body: createHolidaySchema }),
  createHolidayController,
);

holidaysRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.HOLIDAY_READ),
  validate({ params: holidayIdParamSchema }),
  getHolidayController,
);

holidaysRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.HOLIDAY_MANAGE),
  validate({ params: holidayIdParamSchema, body: updateHolidaySchema }),
  updateHolidayController,
);

holidaysRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.HOLIDAY_MANAGE),
  validate({ params: holidayIdParamSchema }),
  deleteHolidayController,
);
