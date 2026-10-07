import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  Banknote,
  Briefcase,
  CalendarCheck,
  FileText,
  Megaphone,
  Pin,
  Plane,
  Users,
} from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { toMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getDashboard } from '@/services/dashboard.service';
import type { DashboardPayload, DashboardPayroll } from '@/types/dashboard';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface Stat {
  label: string;
  value: number;
}

const hasStats = (stats: Stat[]): boolean => stats.some((stat) => stat.value > 0);

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

function periodLabel(period: { month: number; year: number }): string {
  return `${MONTHS[period.month - 1] ?? period.month} ${period.year}`;
}

function StatCard({
  title,
  headline,
  stats,
  icon,
}: {
  title: string;
  headline: number;
  stats: Stat[];
  icon: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="rounded-lg bg-slate-100 p-2 text-slate-500">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">{headline}</p>
      <ul className="mt-2 space-y-1 text-xs text-slate-500">
        {stats.map((stat) => (
          <li key={stat.label} className="flex items-center justify-between gap-3">
            <span>{stat.label}</span>
            <span className="font-medium tabular-nums text-slate-700">{stat.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PayrollCard({ payroll }: { payroll: Exclude<DashboardPayroll, null> }) {
  const isOwnPayslip = 'netSalary' in payroll;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isOwnPayslip ? 'Latest payslip' : 'Payroll'}
        </p>
        <Banknote className="h-5 w-5 text-slate-400" aria-hidden />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">
        {formatCurrency(isOwnPayslip ? payroll.netSalary : payroll.totalNetSalary)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{periodLabel(payroll)}</span>
        <StatusBadge status={payroll.status} />
        {!isOwnPayslip ? <span>{plural(payroll.employeeCount, 'employee')} in this run</span> : null}
      </div>
    </Card>
  );
}

function attentionList(data: DashboardPayload): string[] {
  const items: string[] = [];
  if (data.leave.pendingApprovals > 0) {
    items.push(`${plural(data.leave.pendingApprovals, 'leave request')} awaiting approval`);
  }
  if (data.documents.pendingVerification > 0) {
    items.push(`${plural(data.documents.pendingVerification, 'document')} awaiting verification`);
  }
  if (data.documents.expiringSoon > 0) {
    items.push(`${plural(data.documents.expiringSoon, 'document')} expiring within 30 days`);
  }
  return items;
}

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });

  const header = (
    <PageHeader
      title="Dashboard"
      description="Headcount, attendance, leave and announcements at a glance."
    />
  );

  if (dashboard.isPending) {
    return (
      <>
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </>
    );
  }

  if (dashboard.error) {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            message={toMessage(dashboard.error)}
            onRetry={() => void dashboard.refetch()}
          />
        </Card>
      </>
    );
  }

  const data = dashboard.data;
  const attention = attentionList(data);
  const recruitmentStats: Stat[] = [
    { label: 'Candidates in pipeline', value: data.recruitment.candidatesInPipeline },
    { label: 'Interviews this week', value: data.recruitment.interviewsThisWeek },
    { label: 'Offers extended', value: data.recruitment.offersExtended },
  ];

  const attendanceStats: Stat[] = [
    { label: 'Absent', value: data.attendance.absent },
    { label: 'On leave', value: data.attendance.onLeave },
    { label: 'Late', value: data.attendance.late },
  ];
  const leaveStats: Stat[] = [
    { label: 'Approved this month', value: data.leave.approvedThisMonth },
    { label: 'Upcoming', value: data.leave.upcoming },
  ];
  const documentStats: Stat[] = [
    { label: 'Awaiting verification', value: data.documents.pendingVerification },
    { label: 'Expiring soon', value: data.documents.expiringSoon },
  ];

  return (
    <>
      {header}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Headcount"
            headline={data.headcount.total}
            stats={[
              { label: 'Active', value: data.headcount.active },
              { label: 'New this month', value: data.headcount.newThisMonth },
            ]}
            icon={<Users className="h-5 w-5" aria-hidden />}
          />

          {hasStats(attendanceStats) || data.attendance.present > 0 ? (
            <StatCard
              title={`Attendance · ${formatDate(data.attendance.date, 'today')}`}
              headline={data.attendance.present}
              stats={attendanceStats}
              icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
            />
          ) : null}

          {hasStats(leaveStats) || data.leave.pendingApprovals > 0 ? (
            <StatCard
              title="Leave"
              headline={data.leave.pendingApprovals}
              stats={leaveStats}
              icon={<Plane className="h-5 w-5" aria-hidden />}
            />
          ) : null}

          {hasStats(documentStats) ? (
            <StatCard
              title="Documents"
              headline={data.documents.pendingVerification}
              stats={documentStats}
              icon={<FileText className="h-5 w-5" aria-hidden />}
            />
          ) : null}
        </div>

        {data.payroll || attention.length > 0 || hasStats(recruitmentStats) ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {data.payroll ? <PayrollCard payroll={data.payroll} /> : null}

            {attention.length > 0 ? (
              <Card>
                <CardHeader
                  title="Needs attention"
                  description="Items waiting on you or your team."
                  action={<AlertCircle className="h-5 w-5 text-amber-500" aria-hidden />}
                />
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {attention.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {hasStats(recruitmentStats) ? (
              <StatCard
                title="Recruitment"
                headline={data.recruitment.openJobs}
                stats={recruitmentStats}
                icon={<Briefcase className="h-5 w-5" aria-hidden />}
              />
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardHeader
            title="Announcements"
            description={
              data.announcements.unread > 0
                ? `${plural(data.announcements.unread, 'unread announcement')}`
                : 'Latest posts for your roles and teams.'
            }
            action={
              data.announcements.unread > 0 ? (
                <Badge tone="info">{data.announcements.unread} new</Badge>
              ) : null
            }
          />
          <CardContent>
            {data.announcements.latest.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-6 w-6" aria-hidden />}
                title="No announcements"
                description="When HR publishes an update it will show up here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.announcements.latest.map((announcement) => (
                  <li key={announcement.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 text-slate-400">
                      {announcement.isPinned ? (
                        <Pin className="h-4 w-4 text-brand-500" aria-label="Pinned" />
                      ) : !announcement.isRead ? (
                        <span
                          className="block h-2 w-2 rounded-full bg-brand-500"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
                        <Badge>{announcement.audience}</Badge>
                        {!announcement.isRead ? <Badge tone="info">Unread</Badge> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{announcement.content}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDate(announcement.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
