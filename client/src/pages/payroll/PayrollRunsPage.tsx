import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IndianRupee, Lock, PlayCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import {
  lockPayrollRun,
  listPayrollRuns,
  processPayroll,
} from '@/services/payroll.service';
import type { PayrollRun, PayrollStatus } from '@/types/payroll';

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

/** Only fully finished months can be processed. */
function processablePeriods(): { year: number; month: number }[] {
  const now = new Date();
  const periods: { year: number; month: number }[] = [];
  for (let offset = 1; offset <= 18; offset += 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    periods.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
  }
  return periods;
}

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const periodLabel = (run: Pick<PayrollRun, 'month' | 'year'>): string =>
  `${MONTHS[run.month - 1] ?? run.month} ${run.year}`;

export function PayrollRunsPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PayrollStatus | ''>('');
  const [processingOpen, setProcessingOpen] = useState(false);
  const [locking, setLocking] = useState<PayrollRun | null>(null);

  const periods = useMemo(() => processablePeriods(), []);
  const canProcess = can(role, 'payroll:process');
  const canLock = can(role, 'payroll:lock');

  const runs = useQuery({
    queryKey: ['payroll', 'runs', { page, status }],
    queryFn: () => listPayrollRuns({ page, limit: 20, status: status || undefined, sortOrder: 'desc' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    void queryClient.invalidateQueries({ queryKey: ['payslips'] });
  };

  const process = useMutation({
    mutationFn: (period: { year: number; month: number }) => processPayroll(period),
    onSuccess: (result) => {
      toast.success(
        `${periodLabel(result)} processed for ${result.employeeCount} employee(s)${
          result.missingSalaryStructures > 0
            ? `, ${result.missingSalaryStructures} skipped without a salary structure`
            : ''
        }`,
      );
      setProcessingOpen(false);
      invalidate();
    },
    onError: (error) => {
      setProcessingOpen(false);
      toast.error(toMessage(error));
    },
  });

  const lock = useMutation({
    mutationFn: (id: string) => lockPayrollRun(id),
    onSuccess: (run) => {
      toast.success(`${periodLabel(run)} locked. Payslips are now final.`);
      setLocking(null);
      invalidate();
    },
    onError: (error) => {
      setLocking(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<PayrollRun>[] = [
    {
      key: 'period',
      header: 'Period',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{periodLabel(row)}</p>
          <p className="text-xs text-slate-500">
            {row.employeeCount} employee(s) · processed by {row.processedBy?.email ?? 'system'}
          </p>
        </div>
      ),
    },
    {
      key: 'gross',
      header: 'Gross',
      className: 'text-right',
      render: (row) => <span className="tabular-nums">{money(row.totalGrossSalary)}</span>,
    },
    {
      key: 'deductions',
      header: 'Deductions',
      className: 'text-right',
      render: (row) => <span className="tabular-nums text-rose-600">{money(row.totalDeductions)}</span>,
    },
    {
      key: 'net',
      header: 'Net payable',
      className: 'text-right',
      render: (row) => <span className="font-medium tabular-nums">{money(row.totalNetSalary)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) =>
        canLock && row.status === 'PROCESSED' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Lock ${periodLabel(row)}`}
            onClick={() => setLocking(row)}
          >
            <Lock className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{row.lockedAt ? 'Final' : ''}</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payroll Runs"
        description="Process a finished month from attendance, then lock it to make payslips final."
        actions={
          canProcess ? (
            <Button
              leftIcon={<PlayCircle className="h-4 w-4" />}
              onClick={() => setProcessingOpen(true)}
            >
              Process payroll
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <Select
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PayrollStatus | '');
              setPage(1);
            }}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'PROCESSED', label: 'Processed' },
              { value: 'LOCKED', label: 'Locked' },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          rows={runs.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={runs.isPending}
          isFetching={runs.isFetching}
          error={runs.error}
          onRetry={() => void runs.refetch()}
          emptyTitle="No payroll runs yet"
          emptyDescription="Process a finished month to generate payslips from attendance."
        />

        <Pagination meta={runs.data?.meta} onPageChange={setPage} />
      </Card>

      {processingOpen ? (
        <ProcessPayrollDialog
          periods={periods}
          isSubmitting={process.isPending}
          onClose={() => setProcessingOpen(false)}
          onSubmit={(period) => process.mutate(period)}
        />
      ) : null}

      <ConfirmDialog
        open={locking !== null}
        title={`Lock ${locking ? periodLabel(locking) : ''}`}
        message="Locking freezes every payslip in this run. Payslips can no longer be regenerated for this period."
        confirmLabel="Lock payroll"
        isLoading={lock.isPending}
        onCancel={() => setLocking(null)}
        onConfirm={() => locking && lock.mutate(locking.id)}
      />
    </>
  );
}

function ProcessPayrollDialog({
  periods,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  periods: { year: number; month: number }[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (period: { year: number; month: number }) => void;
}) {
  const [value, setValue] = useState(() => {
    const first = periods[0];
    return first ? `${first.year}-${String(first.month).padStart(2, '0')}` : '';
  });
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open
      title="Process payroll"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            leftIcon={<IndianRupee className="h-4 w-4" />}
            onClick={() => {
              const [year, month] = value.split('-');
              if (!year || !month) return;
              onSubmit({
                year: Number(year),
                month: Number(month),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
              });
            }}
          >
            Process
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Payroll uses each employee's active salary structure. Absent working days are deducted at the
          monthly daily rate, while weekends, holidays and approved leave are not counted against pay.
        </p>

        <Select
          label="Period"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          options={periods.map((period) => ({
            value: `${period.year}-${String(period.month).padStart(2, '0')}`,
            label: periodLabel({ month: period.month, year: period.year }),
          }))}
        />

        <Textarea
          label="Notes"
          value={notes}
          placeholder="Optional note stored on the run"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Modal>
  );
}