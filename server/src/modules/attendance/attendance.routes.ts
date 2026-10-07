import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  attendanceSummaryController,
  correctAttendanceController,
  listAttendanceController,
  listMyAttendanceController,
  listTeamAttendanceController,
  markAttendanceController,
} from './attendance.controller';
import {
  attendanceIdParamSchema,
  attendanceSummaryQuerySchema,
  correctAttendanceSchema,
  listAttendanceQuerySchema,
  markAttendanceSchema,
} from './attendance.validator';

export const attendanceRouter = Router();

attendanceRouter.use(authenticate);

attendanceRouter.get(
  '/my',
  requirePermission(PERMISSIONS.ATTENDANCE_READ_OWN),
  validate({ query: listAttendanceQuerySchema }),
  listMyAttendanceController,
);

attendanceRouter.get(
  '/team',
  requirePermission(PERMISSIONS.ATTENDANCE_READ_TEAM, PERMISSIONS.ATTENDANCE_READ_ANY),
  validate({ query: listAttendanceQuerySchema }),
  listTeamAttendanceController,
);

attendanceRouter.get(
  '/summary',
  requirePermission(
    PERMISSIONS.ATTENDANCE_READ_OWN,
    PERMISSIONS.ATTENDANCE_READ_TEAM,
    PERMISSIONS.ATTENDANCE_READ_ANY,
  ),
  validate({ query: attendanceSummaryQuerySchema }),
  attendanceSummaryController,
);

attendanceRouter.get(
  '/',
  requirePermission(
    PERMISSIONS.ATTENDANCE_READ_OWN,
    PERMISSIONS.ATTENDANCE_READ_TEAM,
    PERMISSIONS.ATTENDANCE_READ_ANY,
  ),
  validate({ query: listAttendanceQuerySchema }),
  listAttendanceController,
);

attendanceRouter.post(
  '/',
  requirePermission(PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.ATTENDANCE_CORRECT),
  validate({ body: markAttendanceSchema }),
  markAttendanceController,
);

attendanceRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ATTENDANCE_CORRECT),
  validate({ params: attendanceIdParamSchema, body: correctAttendanceSchema }),
  correctAttendanceController,
);
