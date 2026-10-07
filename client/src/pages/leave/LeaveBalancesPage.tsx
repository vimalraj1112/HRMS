import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { toMessage } from '@/lib/api';
import { listEmployees } from '@/services/employee.service';
import {
  adjustLeaveBalance,
  employeeLeaveBalances,
  rolloverLeaveBalances,
} from '@/services/leave.service';
import type { LeaveBalance, LeaveBalanceAdjustment } from '@/types/time';

const currentYear = new Date().getFullYear();

const adjustmentSchema = z.object({
  allocated: z.coerce.number().min(0, 'Allocation cannot be negative'),
  carriedForward: z.coerce.number().min(0, 'Carry forward cannot be negative'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

type AdjustmentValues = z.infer<typeof adjustmentSchema>;

type BalanceRow = LeaveBalance;

export function LeaveBalancesPage() {
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [adjusting, setAdjusting] = useState<BalanceRow | null>(null);
  const [rolling, setRolling] = useState(false);

  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1].map(String), []);

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => listEmployees({ limit: 200, sortBy: 'employeeCode', sortOrder: 'asc' }),
  });

  const employeeId = selectedEmployeeId || employees.data?.items[0]?.id || '';

  const balances = useQuery({
    queryKey: ['leave-balances', 'employee', employeeId, year],
    queryFn: () => employeeLeaveBalances(employeeId, year),
    enabled: employeeId.length > 0,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    void queryClient.invalidateQueries({ queryKey: ['leave-balances', 'me'] });
  };

  const save = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AdjustmentValues }) => {
      const payload: LeaveBalanceAdjustment = {
        allocated: values.allocated,
        carriedForward: values.carriedForward,
        ...(values.note ? { note: values.note } : {}),
      };
      return adjustLeaveBalance(id, payload);
    },
    onSuccess: () => {
      toast.success('Leave balance updated');
      setAdjusting(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const rollover = useMutation({
    mutationFn: () => rolloverLeaveBalances(currentYear, currentYear + 1),
    onSuccess: (result) => {
      toast.success(
        `${currentYear + 1} balances ready: ${result.created} created, ${result.kept} kept, ${result.carried.length} carried forward`,
      );
      setRolling(false);
      invalidate();
    },
    onError: (error) => {
      setRolling(false);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<BalanceRow>[] = [
    {
      key: 'leaveType',
      header: 'Leave type',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.leaveType.color ?? '#cbd5e1' }} aria-hidden />
          <div>
            <p className="font-medium text-slate-900">{row.leaveType.name}</p>
            <p className="text-xs text-slate-500">
              {row.leaveType.code} · quota {row.annualQuota} {row.leaveType.unit === 'HOURS' ? 'hours' : 'days'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'allocated', header: 'Allocated', className: 'text-right', render: (row) => row.allocated },
    { key: 'carried', header: 'Carried in', className: 'text-right', render: (row) => row.carriedForward },
    {
      key: 'used',
      header: 'Used / pending',
      className: 'text-right',
      render: (row) => (
        <span>
          {row.used}
          {row.pending > 0 ? <span className="text-slate-400"> / {row.pending}</span> : null}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      className: 'text-right',
      render: (row) => <span className="font-medium text-slate-900">{row.available}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.leaveType.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Adjust ${row.leaveType.name}`}
          onClick={() => setAdjusting(row)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const employee = balances.data?.employee;

  return (
    <>
      <PageHeader
        title="Leave Balances"
        description="Review allocations, usage and carry forward, or grant extra leave to an employee."
        actions={
          <Button
            variant="secondary"
            leftIcon={<CalendarRange className="h-4 w-4" />}
            onClick={() => setRolling(true)}
          >
            Roll over to {currentYear + 1}
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:w-2/3">
          <Select
            label="Employee"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            options={(employees.data?.items ?? []).map((item) => ({
              value: item.id,
              label: `${item.employeeCode} · ${item.firstName} ${item.lastName}`,
            }))}
            placeholder="Select an employee"
          />
          <Select
            label="Year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            options={years.map((option) => ({ value: option, label: option }))}
          />
        </div>

        <DataTable
          columns={columns}
          rows={balances.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={balances.isPending}
          isFetching={balances.isFetching}
          error={balances.error}
          onRetry={() => void balances.refetch()}
          emptyTitle={employeeId ? 'No balance rows for this year' : 'Select an employee'}
          emptyDescription={
            employeeId
              ? 'Balances appear once a leave type is assigned or the year rolls over.'
              : 'Pick an employee to review their balances.'
          }
        />

        {employee ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <Badge tone="info">{employee.employeeCode}</Badge>
            <span>
              {employee.firstName} {employee.lastName}
            </span>
            <span className="ml-auto">Year {balances.data?.year}</span>
          </div>
        ) : null}
      </Card>

      {adjusting !== null ? (
        <AdjustBalanceDialog
          key={adjusting.id}
          balance={adjusting}
          isSubmitting={save.isPending}
          onClose={() => setAdjusting(null)}
          onSubmit={(values) => save.mutate({ id: adjusting.id, values })}
        />
      ) : null}

      <ConfirmDialog
        open={rolling}
        title={`Roll ${currentYear} balances into ${currentYear + 1}`}
        message={`Every active employee gets a ${currentYear + 1} row for each active leave type, with the annual quota and any unused leave carried forward within the leave type limit. Existing grants are kept. This is safe to run more than once.`}
        confirmLabel="Roll balances over"
        isLoading={rollover.isPending}
        onCancel={() => setRolling(false)}
        onConfirm={() => rollover.mutate()}
      />
    </>
  );
}

function AdjustBalanceDialog({
  balance,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  balance: BalanceRow;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: AdjustmentValues) => void;
}) {
  const [values, setValues] = useState<AdjustmentValues>({
    allocated: balance.allocated,
    carriedForward: balance.carriedForward,
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const consumed = balance.used + balance.pending;

  const submit = () => {
    const result = adjustmentSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  };

  return (
    <Modal
      open
      title={`Adjust ${balance.leaveType.name}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            Save balance
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>{balance.year}</span>
          <span>
            {balance.used} used · {balance.pending} pending · {balance.available} available
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Allocated"
            type="number"
            min={0}
            step="0.5"
            value={values.allocated}
            error={
              errors.allocated ??
              (values.allocated < consumed ? `Must cover the ${consumed} already used or pending` : undefined)
            }
            onChange={(event) => setValues({ ...values, allocated: Number(event.target.value) })}
          />
          <Input
            label="Carried forward"
            type="number"
            min={0}
            step="0.5"
            value={values.carriedForward}
            error={errors.carriedForward}
            onChange={(event) => setValues({ ...values, carriedForward: Number(event.target.value) })}
          />
        </div>

        <Textarea
          label="Reason"
          value={values.note}
          error={errors.note}
          placeholder="Why is this balance changing?"
          onChange={(event) => setValues({ ...values, note: event.target.value })}
        />
      </div>
    </Modal>
  );
}