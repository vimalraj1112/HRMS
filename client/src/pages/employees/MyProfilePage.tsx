import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { EmployeeProfile } from './EmployeeDetailPage';

export function MyProfilePage() {
  const employeeId = useAuthStore((state) => state.user?.employee?.id ?? null);

  if (!employeeId) return <Navigate to="/dashboard" replace />;

  return <EmployeeProfile id={employeeId} selfService />;
}
