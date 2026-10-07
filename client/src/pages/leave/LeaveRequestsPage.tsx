import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, fullName } from '@/lib/utils';
import { decideLeaveRequest, listApprovals, listLeaveRequests } from '@/services/leave.service';
import { useAuthStore } from '@/stores/auth.store';
import { LEAVE_STATUSES, type LeaveRequest, type LeaveRequestStatus } from '@/types/time';

type Decision = 'APPROVE' | 'REJECT';

interface DecisionState {
  request: LeaveRequest;
  decision: Decision;
  remark: string;
}

export function LeaveRequestsPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canApproveHr = can(role, 'leave:approve:hr') || can(role, 'leave:manage');
  const canApproveManager = can(role, 'leave:approve:manager');

  const [tab, setTab] = useState<'approvals' | 'register'>('approvals');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeaveRequestStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [decision, setDecision] = useState<DecisionState | null>(null);

  const approvals = useQuery({
    queryKey: ['leaves', 'approvals', { page }],
    queryFn: () => listApprovals({ page, limit: 10 }),
    enabled: tab === 'approvals' && (canApproveHr || canApproveManager),
  });

  const register = useQuery({
    queryKey: ['leaves', 'register', { page, status, from, to }],
    queryFn: () =>
      listLeaveRequests({
        page,
        limit: 10,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        sortBy: 'appliedAt',
        sortOrder: 'desc',
      }),
    enabled: tab === 'register',
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: Decision; remark?: string }) =>
      decideLeaveRequest(input.id, { decision: input.decision, ...(input.remark ? { remark: input.remark } : {}) }),
    onSuccess: (request) => {
      toast.success(
        request.status === 'APPROVED'
          ? 'Leave fully approved'
          : request.status === 'REJECTED'
            ? 'Leave request rejected'
            : 'Stage approved, waiting for the next approver',
      );
      setDecision(null);
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const rows = tab === 'approvals' ? (approvals.data?.items ?? []) : (register.data?.items ?? []);
  const active = tab === 'approvals' ? approvals : register;

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{fullName(row.employee)}</p>
          <p className="text-xs text-slate-500">
            {row.employee.employeeCode}
            {row.employee.department ? ` · ${row.employee.department.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Leave type',
      render: (row) => (
        <div>
          <p className="text-slate-900">{row.leaveType.name}</p>
          <p className="text-xs text-slate-500">{row.totalDays} day(s)</p>
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
    {
      key: 'stages',
      header: 'Approval',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={toneFor(row.managerStage)}>Manager: {row.managerStage.toLowerCase()}</Badge>
          <Badge tone={toneFor(row.hrStage)}>HR: {row.hrStage.toLowerCase()}</Badge>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'applied',
      header: 'Applied',
      render: (row) => <span className="text-xs text-slate-500">{formatDateTime(row.appliedAt)}</span>,
    },
    ...(tab === 'approvals'
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: LeaveRequest) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Approve leave for ${fullName(row.employee)}`}
                  onClick={() => setDecision({ request: row, decision: 'APPROVE', remark: '' })}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Reject leave for ${fullName(row.employee)}`}
                  onClick={() => setDecision({ request: row, decision: 'REJECT', remark: '' })}
                >
                  <XCircle className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ),
          } satisfies Column<LeaveRequest>,
        ]
      : []),
  ];

  const awaitingYou = approvals.data?.meta.total ?? 0;

  return (
    <>
      <PageHeader
        title="Leave Requests"
        description="Two stage approval: the assigned manager signs off first, then HR confirms the balance."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setTab('approvals');
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === 'approvals' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Awaiting my approval{awaitingYou > 0 ? ` (${awaitingYou})` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setTab('register');
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              All requests
            </button>
          </div>

          {tab === 'register' ? (
            <Select
              className="sm:w-52"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as LeaveRequestStatus | '');
              }}
              options={LEAVE_STATUSES.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="All statuses"
              aria-label="Status"
            />
          ) : null}

          {tab === 'register' ? (
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                type="date"
                value={from}
                aria-label="Leave from"
                onChange={(event) => {
                  setPage(1);
                  setFrom(event.target.value);
                }}
              />
              <Input
                type="date"
                value={to}
                aria-label="Leave to"
                onChange={(event) => {
                  setPage(1);
                  setTo(event.target.value);
                }}
              />
            </div>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          isLoading={active.isPending}
          isFetching={active.isFetching}
          error={active.error}
          onRetry={() => void active.refetch()}
          emptyTitle={tab === 'approvals' ? 'Nothing awaiting your approval' : 'No leave requests'}
          emptyDescription={
            tab === 'approvals'
              ? 'New requests from your team appear here as soon as they are submitted.'
              : 'Try clearing the status filter.'
          }
          footer={<Pagination meta={active.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {decision ? (
        <Modal
          open
          title={decision.decision === 'APPROVE' ? 'Approve leave request' : 'Reject leave request'}
          description={`${fullName(decision.request.employee)} · ${formatDate(decision.request.startDate)} → ${formatDate(
            decision.request.endDate,
          )} (${decision.request.totalDays} day(s))`}
          size="sm"
          onClose={() => setDecision(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button
                variant={decision.decision === 'APPROVE' ? 'primary' : 'danger'}
                isLoading={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    id: decision.request.id,
                    decision: decision.decision,
                    ...(decision.remark.trim() ? { remark: decision.remark.trim() } : {}),
                  })
                }
              >
                {decision.decision === 'APPROVE' ? 'Approve' : 'Reject'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{decision.request.reason}</p>
            {decision.request.managerStage === 'PENDING' ? (
              <p className="text-xs text-amber-700">
                You are recording the manager stage. A second HR approval is still required before the leave is fully
                approved.
              </p>
            ) : null}
            <Textarea
              label={decision.decision === 'REJECT' ? 'Reason for rejection' : 'Remark (optional)'}
              value={decision.remark}
              placeholder={
                decision.decision === 'REJECT' ? 'A remark is required to reject' : 'Anything HR should know'
              }
              onChange={(event) => setDecision({ ...decision, remark: event.target.value })}
            />
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function toneFor(stage: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (stage === 'APPROVED') return 'success';
  if (stage === 'REJECTED') return 'danger';
  if (stage === 'PENDING') return 'warning';
  return 'neutral';
}
