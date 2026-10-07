import { useParams } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuthStore } from '@/stores/auth.store';
import { visibleSections } from '@/config/navigation';

const TITLES: Record<string, string> = {
  '/employees': 'Employees',
  '/employees/new': 'New Employee',
  '/employees/:id': 'Employee Profile',
  '/departments': 'Departments',
  '/designations': 'Designations',
  '/attendance': 'Attendance',
  '/attendance/my': 'My Attendance',
  '/attendance/team': 'Team Attendance',
  '/leaves': 'Leave Management',
  '/leaves/my': 'My Leaves',
  '/leaves/requests': 'Leave Requests',
  '/leaves/types': 'Leave Types',
  '/holidays': 'Holiday Calendar',
  '/payroll': 'Payroll',
  '/payroll/salary': 'Salary Structures',
  '/payroll/payslips': 'Payslips',
  '/documents': 'Documents',
  '/recruitment/jobs': 'Job Openings',
  '/recruitment/candidates': 'Candidates',
  '/recruitment/interviews': 'Interviews',
  '/recruitment/offers': 'Offers',
  '/performance/goals': 'Goals & KPIs',
  '/performance/reviews': 'Performance Reviews',
  '/announcements': 'Announcements',
  '/reports': 'Reports',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
};

export function PlaceholderPage({ path }: { path: string }) {
  const params = useParams();
  const user = useAuthStore((state) => state.user);
  const title = TITLES[path] ?? 'Module';
  const allowed = visibleSections(user?.role).some((section) => section.items.some((item) => path.startsWith(item.to)));

  return (
    <>
      <PageHeader
        title={params.id ? `${title}` : title}
        description={allowed ? undefined : 'You do not have access to this module.'}
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: title }]}
      />
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <EmptyState
          icon={<Construction className="h-6 w-6" />}
          title={`${title} module is being built`}
          description="This screen is delivered in an upcoming build phase. Navigation and access control are already live."
        />
      </div>
    </>
  );
}
