import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { applyLeave, cancelLeaveRequest, listLeaveTypes, listMyLeaveRequests, myLeaveBalances } from '@/services/leave.service';
import { LEAVE_STATUSES, type LeaveBalance, type LeaveRequest, type LeaveRequestStatus } from '@/types/time';

const applySchema = z
  .object({
    leaveTypeId: z.string().min(1, 'Choose a leave type'),
    startDate: z.string().min(1, 'Pick a start date'),
    endDate: z.string().min(1, 'Pick an end date'),
    reason: z.string().trim().min(5, 'Give a short reason (5 characters or more)').max(500),
    contactDuringLeave: z
      .string()
      .trim()
      .regex(/^([+]?[0-9\s()-]{7,20})?$/, 'Enter a valid phone number')
      .optional()
      .or(z.literal('')),
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'The end date cannot be before the start date',
  })
  .refine((value) => !value.startDate || value.startDate >= new Date().toISOString().slice(0, 10), {
    path: ['startDate'],
    message: 'Leave cannot be backdated',
  });

type ApplyValues = z.infer<typeof applySchema>;

const emptyValues: ApplyValues = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  reason: '',
  contactDuringLeave: '',
};

function stageBadges(request: LeaveRequest) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={request.managerStage === 'APPROVED' ? 'success' : request.managerStage === 'REJECTED' ? 'danger' : 'warning'}>
        Manager: {request.managerStage.toLowerCase()}
      </Badge>
      <Badge tone={request.hrStage === 'APPROVED' ? 'success' : request.hrStage === 'REJECTED' ? 'danger' : 'warning'}>
        HR: {request.hrStage.toLowerCase()}
      </Badge>
    </div>
  );
}

export function MyLeavesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeaveRequestStatus | ''>('');
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const requests = useQuery({
    queryKey: ['leaves', 'my', { page, status }],
    queryFn: () => listMyLeaveRequests({ page, limit: 10, status: status || undefined, sortBy: 'startDate', sortOrder: 'desc' }),
  });

  const balances = useQuery({
    queryKey: ['leave-balances', 'me'],
    queryFn: () => myLeaveBalances(),
  });

  const types = useQuery({
    queryKey: ['leave-types', 'active'],
    queryFn: () => listLeaveTypes({ limit: 50, sortBy: 'name', sortOrder: 'asc' }),
  });

  const apply = useMutation({
    mutationFn: (values: ApplyValues) =>
      applyLeave({
        leaveTypeId: values.leaveTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
        ...(values.contactDuringLeave ? { contactDuringLeave: values.contactDuringLeave } : {}),
      }),
    onSuccess: (request) => {
      toast.success(`Leave request submitted for ${request.totalDays} day(s)`);
      setApplying(false);
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: (input: { id: string; reason: string }) => cancelLeaveRequest(input.id, input.reason),
    onSuccess: () => {
      toast.success('Leave request cancelled');
      setCancelling(null);
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
    onError: (error) => {
      setCancelling(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'type',
      header: 'Leave type',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.leaveType.name}</p>
          <p className="text-xs text-slate-500">
            {row.leaveType.code} · {row.totalDays} day(s)
          </p>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (row) => (
        <span className="text-slate-700">
          {formatDate(row.startDate)} → {formatDate(row.endDate)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'stages', header: 'Approval', render: (row) => stageBadges(row) },
    { key: 'reason', header: 'Reason', className: 'max-w-xs truncate text-slate-600', render: (row) => row.reason },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) =>
        row.status === 'PENDING' || row.status === 'APPROVED' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Cancel leave from ${formatDate(row.startDate)}`}
            onClick={() => {
              setCancelling(row);
              setCancelReason('');
            }}
          >
            <XCircle className="h-4 w-4 text-rose-600" />
          </Button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="My Leaves"
        description="Apply for leave, track approvals and review your balances."
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setApplying(true)}>
            Apply for leave
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Requests</h2>
            <Select
              className="sm:w-56"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as LeaveRequestStatus | '');
              }}
              options={LEAVE_STATUSES.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="All statuses"
              aria-label="Status"
            />
          </div>

          <DataTable
            columns={columns}
            rows={requests.data?.items ?? []}
            rowKey={(row) => row.id}
            isLoading={requests.isPending}
            isFetching={requests.isFetching}
            error={requests.error}
            onRetry={() => void requests.refetch()}
            emptyTitle="No leave requests"
            emptyDescription="Apply for leave and it will show up here with its approval status."
            emptyAction={
              <Button size="sm" onClick={() => setApplying(true)}>
                Apply for leave
              </Button>
            }
            footer={<Pagination meta={requests.data?.meta} onPageChange={setPage} />}
          />
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">Balances {balances.data?.year ?? ''}</h2>
          </div>

          {balances.isPending ? <p className="text-sm text-slate-400">Loading balances…</p> : null}
          {balances.isError ? <p className="text-sm text-rose-600">{toMessage(balances.error)}</p> : null}
          <ul className="space-y-3">
            {(balances.data?.items ?? []).map((balance) => (
              <li key={balance.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{balance.leaveType.name}</p>
                  <Badge tone={balance.available > 0 ? 'success' : 'danger'}>{balance.available} left</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Allocated {balance.allocated} · Used {balance.used} · Pending {balance.pending}
                </p>
                <BalanceBar balance={balance} />
              </li>
            ))}
            {balances.isSuccess && (balances.data?.items ?? []).length === 0 ? (
              <li className="text-sm text-slate-400">No balances allocated yet.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      {applying ? (
        <ApplyLeaveDialog
          leaveTypes={(types.data?.items ?? []).filter((type) => type.isActive)}
          isSubmitting={apply.isPending}
          onClose={() => setApplying(false)}
          onSubmit={(values) => apply.mutate(values)}
        />
      ) : null}

      <Modal
        open={cancelling !== null}
        title="Cancel leave request"
        description="Reserved days are released back to your balance straight away."
        size="sm"
        onClose={() => setCancelling(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep request
            </Button>
            <Button
              variant="danger"
              isLoading={cancel.isPending}
              onClick={() => cancelling && cancel.mutate({ id: cancelling.id, reason: cancelReason.trim() })}
            >
              Cancel leave
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          value={cancelReason}
          placeholder="Why are you cancelling?"
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
    </>
  );
}

function BalanceBar({ balance }: { balance: LeaveBalance }) {
  const total = Math.max(balance.allocated + balance.carriedForward, balance.used + balance.pending, 1);
  const usedWidth = (balance.used / total) * 100;
  const pendingWidth = (balance.pending / total) * 100;

  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <span className="bg-emerald-500" style={{ width: `${usedWidth}%` }} />
      <span className="bg-amber-400" style={{ width: `${pendingWidth}%` }} />
    </div>
  );
}

function ApplyLeaveDialog({
  leaveTypes,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  leaveTypes: { id: string; name: string; code: string; annualQuota: number; minDaysNotice: number; unit: string }[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: ApplyValues) => void;
}) {
  const [values, setValues] = useState<ApplyValues>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const result = applySchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  };

  const selected = leaveTypes.find((type) => type.id === values.leaveTypeId);

  return (
    <Modal
      open
      title="Apply for leave"
      description="Weekends and holidays are excluded when working days are counted."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Select
            label="Leave type"
            value={values.leaveTypeId}
            error={errors.leaveTypeId}
            placeholder="Choose a leave type"
            options={leaveTypes.map((type) => ({
              value: type.id,
              label: `${type.name} (${type.annualQuota} ${type.unit === 'HOURS' ? 'hours' : 'days'}/year)`,
            }))}
            onChange={(event) => setValues({ ...values, leaveTypeId: event.target.value })}
          />
          {selected ? (
            <p className="mt-1.5 text-xs text-slate-500">
              At least {selected.minDaysNotice} day(s) of advance notice required.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="From"
            type="date"
            value={values.startDate}
            error={errors.startDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setValues({ ...values, startDate: event.target.value })}
          />
          <Input
            label="To"
            type="date"
            value={values.endDate}
            error={errors.endDate}
            min={values.startDate || new Date().toISOString().slice(0, 10)}
            onChange={(event) => setValues({ ...values, endDate: event.target.value })}
          />
        </div>
        <Textarea
          label="Reason"
          value={values.reason}
          error={errors.reason}
          placeholder="Why are you taking this leave?"
          onChange={(event) => setValues({ ...values, reason: event.target.value })}
        />
        <Input
          label="Contact during leave"
          value={values.contactDuringLeave}
          error={errors.contactDuringLeave}
          placeholder="+91 90000 00000"
          onChange={(event) => setValues({ ...values, contactDuringLeave: event.target.value })}
        />
      </div>
    </Modal>
  );
}
