import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { can } from '@/lib/permissions';
import { formatDate, fullName } from '@/lib/utils';
import { listEmployees } from '@/services/employee.service';
import { listWeeklyTimesheets } from '@/services/timesheet.service';
import { useAuthStore } from '@/stores/auth.store';
import type {
  TimesheetDay,
  TimesheetEmployee,
  TimesheetTotals,
  WeeklyTimesheet,
} from '@/types/timesheet';

const MONDAY_OFFSET: Record<number, number> = { 0: -6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Monday of the week containing an ISO date. */
function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return addDays(iso, MONDAY_OFFSET[date.getUTCDay()] ?? 0);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hours(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const whole = Math.floor(safe / 60);
  const rest = safe % 60;
  if (whole === 0) return `${rest}m`;
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`;
}

function clock(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

function weekLabel(start: string): string {
  return `${formatDate(start)} – ${formatDate(addDays(start, 6))}`;
}

function dayLabel(day: TimesheetDay): string {
  return `${formatDate(day.date)}`;
}

function balanceTone(totals: TimesheetTotals): 'success' | 'warning' | 'danger' | 'neutral' {
  if (totals.shortfallMinutes > 0) return 'danger';
  if (totals.extraMinutes > 0) return 'success';
  return 'neutral';
}

function balanceText(totals: TimesheetTotals): string {
  if (totals.shortfallMinutes > 0) return `${hours(totals.shortfallMinutes)} short`;
  if (totals.extraMinutes > 0) return `${hours(totals.extraMinutes)} extra`;
  return 'On target';
}

function DayStatus({ day }: { day: TimesheetDay }) {
  if (day.status === 'LEAVE') {
    return <Badge tone="purple">Leave{day.leaveType ? ` · ${day.leaveType}` : ''}</Badge>;
  }
  if (day.status === 'UNMARKED') {
    return <Badge tone="neutral">{day.isFuture ? 'Upcoming' : 'Not marked'}</Badge>;
  }
  return <StatusBadge status={day.status} />;
}

export function TimesheetsPage({ mode }: { mode: 'my' | 'all' }) {
  const role = useAuthStore((state) => state.user?.role);
  const [weekOf, setWeekOf] = useState(todayIso());
  const [employeeId, setEmployeeId] = useState('');
  const [page, setPage] = useState(1);

  const canPickEmployee = mode === 'all';
  const canReadAny = can(role, 'timesheet:read:any');

  const employees = useQuery({
    queryKey: ['employees', 'timesheet-picker'],
    enabled: canPickEmployee,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const employeeOptions = useMemo(
    () =>
      (employees.data?.items ?? []).map((employee) => ({
        value: employee.id,
        label: `${fullName(employee)} (${employee.employeeCode})`,
      })),
    [employees.data],
  );

  const timesheets = useQuery({
    queryKey: ['timesheets', mode, { weekOf, employeeId, page }],
    queryFn: () =>
      listWeeklyTimesheets({
        weekOf,
        page,
        limit: 20,
        ...(canPickEmployee && employeeId ? { employeeId } : {}),
      }),
  });

  const weekStart = timesheets.data?.week.start ?? mondayOf(weekOf);
  const items = timesheets.data?.items ?? [];
  const meta = timesheets.data?.meta;

  const shiftWeek = (days: number) => {
    setPage(1);
    setWeekOf((current) => addDays(mondayOf(current), days));
  };

  const isCurrentWeek = mondayOf(weekOf) === mondayOf(todayIso());

  return (
    <>
      <PageHeader
        title={mode === 'my' ? 'My Timesheet' : 'Timesheets'}
        description="Monday to Sunday. Monday–Friday 8 hours, Saturday 5 hours, 45 hours a week. Hours come from attendance check-in/check-out; leave and holidays are credited automatically."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => shiftWeek(-7)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekOf(todayIso())} disabled={isCurrentWeek}>
              This week
            </Button>
            <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => shiftWeek(7)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        }
      />

      <Card className="mb-4 print:hidden">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <div className="w-full sm:w-56">
            <Input
              label="Week of"
              type="date"
              value={weekOf}
              onChange={(event) => {
                if (!event.target.value) return;
                setPage(1);
                setWeekOf(event.target.value);
              }}
            />
          </div>
          {canPickEmployee ? (
            <div className="w-full sm:w-72">
              <Select
                label="Employee"
                value={employeeId}
                placeholder={canReadAny ? 'All employees' : 'My team'}
                options={employeeOptions}
                onChange={(event) => {
                  setPage(1);
                  setEmployeeId(event.target.value);
                }}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2 pb-1 text-sm text-slate-600 lg:ml-auto">
            <CalendarRange className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="font-medium text-slate-900">{weekLabel(weekStart)}</span>
            {isCurrentWeek ? <Badge tone="info">Current week</Badge> : null}
          </div>
        </div>
      </Card>

      <div className="hidden print:mb-4 print:block">
        <h1 className="text-lg font-semibold text-slate-900">
          {mode === 'my' ? 'My Weekly Timesheet' : 'Weekly Timesheet'}
        </h1>
        <p className="text-sm text-slate-600">{weekLabel(weekStart)}</p>
      </div>

      {timesheets.isPending ? (
        <Card className="p-10 text-center text-sm text-slate-500">Loading weekly timesheet…</Card>
      ) : timesheets.error ? (
        <Card className="p-10 text-center text-sm text-rose-600">
          Could not load the timesheet. {timesheets.error instanceof Error ? timesheets.error.message : ''}
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center print:hidden">
          <p className="text-sm font-medium text-slate-900">No timesheet data</p>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'my'
              ? 'Your user account is not linked to an employee record yet.'
              : 'No employees match the selected filters.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {items.map((sheet) => (
            <TimesheetCard key={sheet.employee.id} sheet={sheet} weekStart={weekStart} />
          ))}
          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200 print:hidden">
              <span className="text-slate-500">
                Page {meta.page} of {meta.totalPages} · {meta.total} employee{meta.total === 1 ? '' : 's'}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.hasPrev}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.hasNext}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function TimesheetCard({ sheet, weekStart }: { sheet: WeeklyTimesheet; weekStart: string }) {
  const { employee, days, totals } = sheet;

  return (
    <Card className="timesheet-sheet overflow-hidden print:rounded-none print:shadow-none print:ring-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
            {(employee.firstName[0] ?? '') + (employee.lastName[0] ?? '')}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{employeeName(employee)}</p>
            <p className="text-xs text-slate-500">
              {employee.employeeCode}
              {employee.department ? ` · ${employee.department.name}` : ''}
              {employee.designation ? ` · ${employee.designation.name}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{weekLabel(weekStart)}</p>
          <p className="text-xs text-slate-500">Mon–Fri 8h · Sat 5h · Target {hours(totals.targetMinutes)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
        <Metric
          label="Credited this week"
          value={`${hours(totals.creditedMinutes)} / ${hours(totals.expectedMinutes)}`}
          hint={`Target ${hours(totals.targetMinutes)}`}
        />
        <Metric
          label="Balance"
          value={balanceText(totals)}
          tone={
            balanceTone(totals) === 'danger'
              ? 'text-rose-600'
              : balanceTone(totals) === 'success'
                ? 'text-emerald-600'
                : 'text-slate-900'
          }
          hint={`${hours(totals.workedMinutes)} actually worked`}
        />
        <Metric
          label="Overtime"
          value={hours(totals.overtimeMinutes)}
          tone={totals.overtimeMinutes > 0 ? 'text-brand-700' : 'text-slate-900'}
          hint="Above standard / Sunday"
        />
        <Metric
          label="Attendance"
          value={`${totals.presentDays} present`}
          hint={`${totals.leaveDays} leave · ${totals.holidayDays} holiday · ${totals.absentDays} absent · ${totals.unmarkedDays} unmarked`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-3 py-2.5">Day</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">In</th>
              <th className="px-3 py-2.5">Out</th>
              <th className="px-3 py-2.5 text-right">Worked</th>
              <th className="px-3 py-2.5 text-right">Credited</th>
              <th className="px-3 py-2.5 text-right">Standard</th>
              <th className="px-3 py-2.5 text-right">Overtime</th>
              <th className="px-4 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const isSunday = day.weekday === 'Sun';
              return (
                <tr
                  key={day.date}
                  className={[
                    'border-b border-slate-100 align-top',
                    isSunday ? 'bg-slate-50/80 text-slate-400' : '',
                    day.isHoliday ? 'bg-brand-50/40' : '',
                    day.isFuture ? 'text-slate-400' : '',
                  ].join(' ')}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800 print:text-slate-900">
                    {dayLabel(day)}
                  </td>
                  <td className="px-3 py-2.5">{day.weekday}</td>
                  <td className="px-3 py-2.5">
                    <DayStatus day={day} />
                    {day.isHoliday && day.holidayName ? (
                      <p className="mt-1 text-xs text-brand-700">{day.holidayName}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{clock(day.checkIn)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{clock(day.checkOut)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {day.workedMinutes > 0 ? hours(day.workedMinutes) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-800 print:text-slate-900">
                    {day.creditedMinutes > 0 ? hours(day.creditedMinutes) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {day.standardMinutes > 0 ? hours(day.standardMinutes) : 'Week off'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {day.overtimeMinutes > 0 ? (
                      <span className="font-medium text-brand-700">{hours(day.overtimeMinutes)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{day.note ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
              <td className="px-4 py-3" colSpan={5}>
                Week total
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{hours(totals.workedMinutes)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{hours(totals.creditedMinutes)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{hours(totals.standardMinutes)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{hours(totals.overtimeMinutes)}</td>
              <td className="px-4 py-3 text-xs font-normal text-slate-500">
                {totals.shortfallMinutes > 0
                  ? `${hours(totals.shortfallMinutes)} short of target`
                  : totals.extraMinutes > 0
                    ? `${hours(totals.extraMinutes)} above target`
                    : 'Target met'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="hidden items-end justify-between gap-8 px-6 pb-6 pt-10 text-xs text-slate-500 print:flex">
        <div className="flex-1 border-t border-slate-400 pt-2">Employee signature</div>
        <div className="flex-1 border-t border-slate-400 pt-2">Manager / HR signature</div>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="bg-white px-5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function employeeName(employee: TimesheetEmployee): string {
  return fullName(employee);
}
