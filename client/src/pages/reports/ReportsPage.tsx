import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/States';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatCurrency } from '@/lib/utils';
import { exportReportCsv, getReport } from '@/services/report.service';
import { useAuthStore } from '@/stores/auth.store';
import type { ReportRequest, ReportRow, ReportType } from '@/types/report';

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

interface ReportOption {
  value: ReportType;
  label: string;
  permission: 'reports:hr' | 'reports:finance';
}

const REPORT_OPTIONS: ReportOption[] = [
  { value: 'overview', label: 'Overview by department', permission: 'reports:hr' },
  { value: 'headcount', label: 'Headcount by status', permission: 'reports:hr' },
  { value: 'attendance', label: 'Attendance by day', permission: 'reports:hr' },
  { value: 'leave', label: 'Leave by type', permission: 'reports:hr' },
  { value: 'payroll', label: 'Payroll by payslip', permission: 'reports:finance' },
];

const MONEY_KEYS = new Set(['gross', 'deductions', 'net', 'totalGross', 'totalDeductions', 'totalNet']);

const humanize = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());

function formatCell(key: string, value: string | number): string {
  if (typeof value !== 'number') return value;
  if (MONEY_KEYS.has(key)) return formatCurrency(value);
  return value.toLocaleString('en-IN');
}

export function ReportsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const canHr = can(role, 'reports:hr');
  const canFinance = can(role, 'reports:finance');
  const available = REPORT_OPTIONS.filter((option) =>
    option.permission === 'reports:hr' ? canHr : canFinance,
  );

  const [reportDraft, setReportDraft] = useState<ReportType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const currentYear = new Date().getFullYear();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(currentYear));

  const report = available.some((option) => option.value === reportDraft)
    ? reportDraft
    : (available[0]?.value ?? '');

  const request: ReportRequest | null = report
    ? report === 'payroll'
      ? { report, month: Number(month), year: Number(year) }
      : { report, from: from || undefined, to: to || undefined }
    : null;

  const preview = useQuery({
    queryKey: ['reports', 'preview', request],
    queryFn: () => {
      if (!request) throw new Error('Pick a report first');
      return getReport(request);
    },
    enabled: request !== null,
  });

  const download = useMutation({
    mutationFn: exportReportCsv,
    onSuccess: () => toast.success('Report downloaded'),
    onError: (error) => toast.error(toMessage(error)),
  });

  if (available.length === 0) {
    return (
      <>
        <PageHeader title="Reports" description="HR and finance reports for the organisation." />
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" aria-hidden />}
            title="No report access"
            description="Your role does not include the HR or finance reports. Ask an administrator if you need access."
          />
        </Card>
      </>
    );
  }

  const payload = preview.data;
  const rows = payload?.rows ?? [];
  const sample = rows[0] ?? {};
  const columns: Column<ReportRow>[] = Object.keys(sample).map((key) => ({
    key,
    header: humanize(key),
    className: typeof sample[key] === 'number' ? 'text-right tabular-nums' : undefined,
    headerClassName: typeof sample[key] === 'number' ? 'text-right' : undefined,
    render: (row) => formatCell(key, row[key]),
  }));

  const periodLabel = payload
    ? payload.range
      ? `${payload.range.from} → ${payload.range.to}`
      : payload.period
        ? `${MONTHS[payload.period.month - 1] ?? payload.period.month} ${payload.period.year}`
        : ''
    : '';

  return (
    <>
      <PageHeader
        title="Reports"
        description="Preview a report on screen or download it as CSV."
        actions={
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" aria-hidden />}
            isLoading={download.isPending}
            disabled={request === null}
            onClick={() => {
              if (request) download.mutate(request);
            }}
          >
            Download CSV
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Report"
            value={report}
            onChange={(event) => setReportDraft(event.target.value as ReportType)}
            options={available.map((option) => ({ value: option.value, label: option.label }))}
          />

          {report === 'payroll' ? (
            <>
              <Select
                label="Month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                options={MONTHS.map((label, index) => ({
                  value: String(index + 1).padStart(2, '0'),
                  label,
                }))}
              />
              <Select
                label="Year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                options={[currentYear - 1, currentYear, currentYear + 1].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
              />
            </>
          ) : (
            <>
              <Input
                label="From"
                type="date"
                value={from}
                hint="Defaults to the last 30 days"
                onChange={(event) => setFrom(event.target.value)}
              />
              <Input
                label="To"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </>
          )}
        </div>

        {payload ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
            {Object.entries(payload.summary).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
              >
                {humanize(key)}
                <span className="font-semibold tabular-nums">{value.toLocaleString('en-IN')}</span>
              </span>
            ))}
            {periodLabel ? <span className="ml-auto text-xs text-slate-400">{periodLabel}</span> : null}
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => JSON.stringify(row)}
          isLoading={preview.isPending && request !== null}
          isFetching={preview.isFetching}
          error={preview.error}
          onRetry={() => void preview.refetch()}
          emptyTitle="No rows for this period"
          emptyDescription="Widen the date range or pick another month."
        />
      </Card>
    </>
  );
}
