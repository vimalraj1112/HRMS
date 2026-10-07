import { Router } from 'express';
import { announcementsRouter } from '../modules/announcements/announcements.routes';
import { attendanceRouter } from '../modules/attendance/attendance.routes';
import { auditRouter } from '../modules/audit/audit.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { departmentsRouter } from '../modules/departments/departments.routes';
import { designationsRouter } from '../modules/designations/designations.routes';
import { documentsRouter } from '../modules/documents/documents.routes';
import { employeesRouter } from '../modules/employees/employees.routes';
import { healthRouter } from '../modules/health/health.routes';
import { holidaysRouter } from '../modules/holidays/holidays.routes';
import { leaveRouter } from '../modules/leave/leave.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { payrollRouter } from '../modules/payroll/payroll.routes';
import { performanceRouter } from '../modules/performance/performance.routes';
import { recruitmentRouter } from '../modules/recruitment/recruitment.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { usersRouter } from '../modules/users/users.routes';

export const v1Router = Router();

v1Router.use('/health', healthRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/employees', employeesRouter);
v1Router.use('/departments', departmentsRouter);
v1Router.use('/designations', designationsRouter);
v1Router.use('/attendance', attendanceRouter);
v1Router.use('/notifications', notificationsRouter);
v1Router.use('/audit-logs', auditRouter);
v1Router.use('/payroll', payrollRouter);
v1Router.use('/documents', documentsRouter);
v1Router.use('/recruitment', recruitmentRouter);
v1Router.use('/performance', performanceRouter);
v1Router.use('/announcements', announcementsRouter);
v1Router.use('/dashboard', dashboardRouter);
v1Router.use('/reports', reportsRouter);
v1Router.use('/settings', settingsRouter);

// The leave router owns three top level prefixes. It is mounted behind a prefix
// guard so that an unknown /api/v1 path falls through to the 404 handler
// instead of reaching the leave router's path level authenticate middleware.
const LEAVE_PREFIXES = ['/leaves', '/leave-types', '/leave-balances'];
v1Router.use((req, res, next) => {
  if (LEAVE_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    leaveRouter(req, res, next);
    return;
  }
  next();
});

v1Router.use('/holidays', holidaysRouter);
