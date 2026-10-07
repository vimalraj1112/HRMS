import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/routing/ProtectedRoute';
import { useAuthStore } from '@/stores/auth.store';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AuditLogsPage } from '@/pages/audit/AuditLogsPage';
import { PayrollRunsPage } from '@/pages/payroll/PayrollRunsPage';
import { PayslipsPage } from '@/pages/payroll/PayslipsPage';
import { SalaryStructuresPage } from '@/pages/payroll/SalaryStructuresPage';
import { AttendancePage, MyAttendancePage, TeamAttendancePage } from '@/pages/attendance/AttendancePages';
import { AnnouncementsPage } from '@/pages/announcements/AnnouncementsPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { DepartmentsPage } from '@/pages/departments/DepartmentsPage';
import { DesignationsPage } from '@/pages/designations/DesignationsPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { EmployeeCreatePage } from '@/pages/employees/EmployeeCreatePage';
import { EmployeeDetailPage } from '@/pages/employees/EmployeeDetailPage';
import { EmployeesPage } from '@/pages/employees/EmployeesPage';
import { MyProfilePage } from '@/pages/employees/MyProfilePage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { HolidaysPage } from '@/pages/holidays/HolidaysPage';
import { LeaveBalancesPage } from '@/pages/leave/LeaveBalancesPage';
import { LeaveRequestsPage } from '@/pages/leave/LeaveRequestsPage';
import { LeaveTypesPage } from '@/pages/leave/LeaveTypesPage';
import { MyLeavesPage } from '@/pages/leave/MyLeavesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { GoalsPage } from '@/pages/performance/GoalsPage';
import { ReviewsPage } from '@/pages/performance/ReviewsPage';
import { CandidatesPage } from '@/pages/recruitment/CandidatesPage';
import { InterviewsPage } from '@/pages/recruitment/InterviewsPage';
import { JobsPage } from '@/pages/recruitment/JobsPage';
import { OffersPage } from '@/pages/recruitment/OffersPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import type { Role } from '@/types/api';

const PEOPLE_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER'];
const HR_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER'];
const RECRUITMENT_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER'];

function Shell({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Shell>
              <DashboardPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Shell>
              <MyProfilePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employees"
        element={
          <ProtectedRoute roles={PEOPLE_ROLES}>
            <Shell>
              <EmployeesPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employees/new"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'RECRUITER']}>
            <Shell>
              <EmployeeCreatePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/employees/:id"
        element={
          <ProtectedRoute>
            <Shell>
              <EmployeeDetailPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/departments"
        element={
          <ProtectedRoute roles={HR_ROLES}>
            <Shell>
              <DepartmentsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/designations"
        element={
          <ProtectedRoute roles={HR_ROLES}>
            <Shell>
              <DesignationsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute roles={HR_ROLES}>
            <Shell>
              <AttendancePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance/team"
        element={
          <ProtectedRoute roles={PEOPLE_ROLES}>
            <Shell>
              <TeamAttendancePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance/my"
        element={
          <ProtectedRoute>
            <Shell>
              <MyAttendancePage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaves/my"
        element={
          <ProtectedRoute>
            <Shell>
              <MyLeavesPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaves/requests"
        element={
          <ProtectedRoute roles={PEOPLE_ROLES}>
            <Shell>
              <LeaveRequestsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaves/types"
        element={
          <ProtectedRoute roles={HR_ROLES}>
            <Shell>
              <LeaveTypesPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaves/balances"
        element={
          <ProtectedRoute roles={HR_ROLES}>
            <Shell>
              <LeaveBalancesPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/holidays"
        element={
          <ProtectedRoute>
            <Shell>
              <HolidaysPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit-logs"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN']}>
            <Shell>
              <AuditLogsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/payroll/payslips"
        element={
          <ProtectedRoute>
            <Shell>
              <PayslipsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/payroll/salary"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'FINANCE', 'HR_ADMIN']}>
            <Shell>
              <SalaryStructuresPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/payroll"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'FINANCE']}>
            <Shell>
              <PayrollRunsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <Shell>
              <DocumentsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recruitment/jobs"
        element={
          <ProtectedRoute roles={RECRUITMENT_ROLES}>
            <Shell>
              <JobsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recruitment/candidates"
        element={
          <ProtectedRoute roles={RECRUITMENT_ROLES}>
            <Shell>
              <CandidatesPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recruitment/interviews"
        element={
          <ProtectedRoute roles={RECRUITMENT_ROLES}>
            <Shell>
              <InterviewsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recruitment/offers"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'RECRUITER']}>
            <Shell>
              <OffersPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/performance/goals"
        element={
          <ProtectedRoute>
            <Shell>
              <GoalsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/performance/reviews"
        element={
          <ProtectedRoute>
            <Shell>
              <ReviewsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <Shell>
              <AnnouncementsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'FINANCE']}>
            <Shell>
              <ReportsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'HR_ADMIN']}>
            <Shell>
              <SettingsPage />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leaves"
        element={
          <ProtectedRoute>
            <Shell>
              <PlaceholderPage path="/leaves" />
            </Shell>
          </ProtectedRoute>
        }
      />

      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
