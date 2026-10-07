import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { can } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { getPayslip, listPayslips } from '@/services/payroll.service';
import type { Payslip } from '@/types/payroll';

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

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const periodLabel = (row: Pick<Payslip, 'month' | 'year'>): string =>
  `${MONTHS[row.month - 1] ?? row.month} ${row.year}`;

export function PayslipsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [viewing, setViewing] = useState<Payslip | null>(null);

  const canReadAny = can(role, 'payslip:read:any');
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(String);

  const payslips = useQuery({
    queryKey: ['payslips', { page, year, month, canReadAny }],
    queryFn: () =>
      listPayslips({
        page,
        limit: 20,
        year: year || undefined,
        month: month || undefined,
        sortOrder: 'desc',
      }),
  });

  const columns: Column<Payslip>[] = [
    {
      key: 'period',
      header: 'Period',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{periodLabel(row)}</p>
          {canReadAny && row.employee ? (
            <p className="text-xs text-slate-500">
              {row.employee.employeeCode} · {row.employee.firstName} {row.employee.lastName}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'attendance',
      header: 'Attendance',
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.daysPresent} present
          {row.daysPaidLeave > 0 ? ` · ${row.daysPaidLeave} paid leave` : ''}
          {row.lopDays > 0 ? <span className="text-rose-600"> · {row.lopDays} LOP</span> : null}
          <span className="block text-slate-400">of {row.workingDays} working days</span>
        </span>
      ),
    },
    {
      key: 'gross',
      header: 'Gross',
      className: 'text-right',
      render: (row) => <span className="tabular-nums">{money(row.grossSalary)}</span>,
    },
    {
      key: 'deductions',
      header: 'Deductions',
      className: 'text-right',
      render: (row) => <span className="tabular-nums text-rose-600">{money(row.totalDeductions)}</span>,
    },
    {
      key: 'net',
      header: 'Net pay',
      className: 'text-right',
      render: (row) => <span className="font-medium tabular-nums">{money(row.netSalary)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <Button variant="ghost" size="icon" aria-label={`View payslip for ${periodLabel(row)}`} onClick={() => setViewing(row)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payslips"
        description={canReadAny ? 'Every payslip generated in the system.' : 'Your payslips by month.'}
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 sm:w-2/3">
          <Select
            label="Year"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setPage(1);
            }}
            options={[{ value: '', label: 'All years' }, ...years.map((option) => ({ value: option, label: option }))]}
          />
          <Select
            label="Month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All months' },
              ...MONTHS.map((label, index) => ({ value: String(index + 1).padStart(2, '0'), label })),
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          rows={payslips.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={payslips.isPending}
          isFetching={payslips.isFetching}
          error={payslips.error}
          onRetry={() => void payslips.refetch()}
          emptyTitle="No payslips yet"
          emptyDescription="Payslips appear once payroll has been processed for a month."
        />

        <Pagination meta={payslips.data?.meta} onPageChange={setPage} />
      </Card>

      {viewing ? <PayslipDialog payslip={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

function PayslipDialog({ payslip: summary, onClose }: { payslip: Payslip; onClose: () => void }) {
  // Opening the dialog loads the authoritative record, which is what the API audits
  // as PAYSLIP_DOWNLOAD, so the list payload is only the initial view.
  const payslipQuery = useQuery({
    queryKey: ['payslip', summary.id],
    queryFn: () => getPayslip(summary.id),
    initialData: summary,
  });
  const payslip = payslipQuery.data;

  const earnings: Array<[string, number]> = [
    ['Basic salary', payslip.basicSalary],
    ['HRA', payslip.hra],
    ['Transport allowance', payslip.transportAllowance],
    ['Medical allowance', payslip.medicalAllowance],
    ['Other allowance', payslip.otherAllowance],
  ];

  const deductions: Array<[string, number]> = [
    ['PF', payslip.pf],
    ['ESI', payslip.esi],
    ['Professional tax', payslip.professionalTax],
    ['TDS', payslip.tds],
    ['Other deduction', payslip.otherDeduction],
  ];

  const row = (label: string, amount: number, tone?: 'positive' | 'negative') => (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={tone === 'positive' ? 'tabular-nums' : tone === 'negative' ? 'tabular-nums text-rose-600' : 'tabular-nums'}>
        {money(amount)}
      </span>
    </div>
  );

  return (
    <Modal
      open
      title={`Payslip · ${periodLabel(payslip)}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-900">
            {payslip.employee.firstName} {payslip.employee.lastName}
          </span>
          <span className="text-slate-500">{payslip.employee.employeeCode}</span>
          <StatusBadge status={payslip.status} />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {payslip.workingDays} working days · {payslip.daysPresent} present · {payslip.daysPaidLeave} paid leave ·{' '}
          {payslip.daysAbsent} absent ({payslip.lopDays} LOP)
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</p>
            {earnings.map(([label, amount]) => row(label, amount))}
            {row('Gross', payslip.grossSalary)}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</p>
            {deductions.map(([label, amount]) => row(label, amount, 'negative'))}
            {row('Total deductions', payslip.totalDeductions)}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm font-medium text-brand-900">Net pay</span>
          <span className="text-lg font-semibold tabular-nums text-brand-900">{money(payslip.netSalary)}</span>
        </div>

        {payslip.lockedAt ? (
          <p className="text-xs text-slate-500">This payslip was locked and can no longer be regenerated.</p>
        ) : null}
      </div>
    </Modal>
  );
}