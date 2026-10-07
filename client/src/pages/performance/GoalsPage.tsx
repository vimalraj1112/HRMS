import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import { createGoal, deleteGoal, listGoals, updateGoal } from '@/services/performance.service';
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  type Goal,
  type GoalPayload,
  type GoalStatus,
  type GoalType,
} from '@/types/performance';

const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }, ...GOAL_STATUSES];
const TYPE_OPTIONS = [{ value: '', label: 'All types' }, ...GOAL_TYPES];

function Progress({ value }: { value: number }) {
  return (
    <div className="flex min-w-[7rem] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${value === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

export function GoalsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const myEmployeeId = useAuthStore((state) => state.user?.employee?.id ?? null);
  const queryClient = useQueryClient();

  const canCreate = can(role, 'goal:manage:own');
  const canManageOthers = can(role, 'goal:manage:team') || can(role, 'goal:manage:any');

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  const goals = useQuery({
    queryKey: ['performance', 'goals', { page, status, type, employeeId }],
    queryFn: () =>
      listGoals({
        page,
        limit: 20,
        status: (status || undefined) as GoalStatus | undefined,
        type: (type || undefined) as GoalType | undefined,
        employeeId: canManageOthers && employeeId ? employeeId : undefined,
        sortBy: 'dueDate',
        sortOrder: 'asc',
      }),
  });

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    enabled: canManageOthers,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['performance'] });
  };

  const remove = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      toast.success('Goal deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => {
      setDeleting(null);
      toast.error(toMessage(error));
    },
  });

  const mayEdit = (goal: Goal) =>
    canCreate && (goal.employeeId === myEmployeeId || canManageOthers);
  const mayDelete = (goal: Goal) =>
    mayEdit(goal) && (goal.status !== 'COMPLETED' || canManageOthers);

  const columns: Column<Goal>[] = [
    {
      key: 'goal',
      header: 'Goal',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-xs text-slate-500">
            {canManageOthers ? `${fullName(row.employee)} · ${row.employee.employeeCode}` : row.type}
          </p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (row) => <span className="text-slate-600">{row.type}</span> },
    { key: 'progress', header: 'Progress', render: (row) => <Progress value={row.progress} /> },
    {
      key: 'kpis',
      header: 'KPIs',
      render: (row) =>
        row.kpis.length === 0 ? (
          <span className="text-xs text-slate-400">-</span>
        ) : (
          <span className="text-xs tabular-nums text-slate-600">
            {row.kpis.filter((kpi) => kpi.achieved).length}/{row.kpis.length} achieved
          </span>
        ),
    },
    {
      key: 'due',
      header: 'Due',
      render: (row) => <span className="text-slate-600">{formatDate(row.dueDate)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) =>
        mayEdit(row) || mayDelete(row) ? (
          <div className="flex justify-end gap-1">
            {mayEdit(row) ? (
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.title}`} onClick={() => setEditing(row)}>
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {mayDelete(row) ? (
              <Button variant="ghost" size="icon" aria-label={`Delete ${row.title}`} onClick={() => setDeleting(row)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-slate-400">View only</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Goals"
        description="Track objectives and key results for you and your team."
        actions={
          canCreate ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New goal
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
              setStatus(event.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
          <Select
            label="Type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            options={TYPE_OPTIONS}
          />
          {canManageOthers ? (
            <Select
              label="Employee"
              value={employeeId}
              onChange={(event) => {
                setEmployeeId(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'Everyone in scope' },
                ...(employees.data?.items ?? []).map((employee) => ({
                  value: employee.id,
                  label: fullName(employee),
                })),
              ]}
            />
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={goals.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={goals.isPending}
          isFetching={goals.isFetching}
          error={goals.error}
          onRetry={() => void goals.refetch()}
          emptyTitle="No goals yet"
          emptyDescription="Create your first goal to start tracking progress."
        />

        <Pagination meta={goals.data?.meta} onPageChange={setPage} />
      </Card>

      {creating ? (
        <GoalDialog
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee),
          }))}
          showEmployeePicker={canManageOthers}
          onClose={() => setCreating(false)}
          onSubmit={(payload) => createGoal(payload as unknown as GoalPayload)}
          onSaved={() => {
            toast.success('Goal created');
            setCreating(false);
            invalidate();
          }}
        />
      ) : null}

      {editing ? (
        <GoalDialog
          goal={editing}
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee),
          }))}
          showEmployeePicker={false}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => updateGoal(editing.id, payload)}
          onSaved={() => {
            toast.success('Goal updated');
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete goal"
        message={`Delete "${deleting?.title ?? ''}"? Its KPIs are removed with it and this cannot be undone.`}
        confirmLabel="Delete"
        isLoading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

interface EmployeeOption {
  value: string;
  label: string;
}

interface KpiRow {
  title: string;
  targetValue: string;
  unit: string;
  weight: string;
}

function GoalDialog({
  goal,
  employees,
  showEmployeePicker,
  onClose,
  onSubmit,
  onSaved,
}: {
  goal?: Goal;
  employees: EmployeeOption[];
  showEmployeePicker: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [employeeId, setEmployeeId] = useState(goal?.employeeId ?? '');
  const [type, setType] = useState<GoalType>(goal?.type ?? 'KPI');
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'NOT_STARTED');
  const [weight, setWeight] = useState(String(goal?.weight ?? 0));
  const [progress, setProgress] = useState(String(goal?.progress ?? 0));
  const [startDate, setStartDate] = useState(goal?.startDate ?? '');
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? '');
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [kpiProgress, setKpiProgress] = useState(goal?.kpis ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addKpi = () => setKpis((rows) => [...rows, { title: '', targetValue: '', unit: '', weight: '0' }]);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        type,
        weight: Number(weight) || 0,
        ...(startDate ? { startDate } : {}),
        ...(dueDate ? { dueDate } : {}),
      };

      if (goal) {
        payload.status = status;
        payload.progress = Number(progress) || 0;

        if (kpiProgress.length > 0) {
          payload.kpiProgress = kpiProgress.map((kpi) => ({
            id: kpi.id,
            currentValue: Number(kpi.currentValue) || 0,
          }));
        }
      } else {
        if (showEmployeePicker && employeeId) payload.employeeId = employeeId;
        const rows = kpis
          .filter((kpi) => kpi.title.trim())
          .map((kpi) => ({
            title: kpi.title.trim(),
            targetValue: Number(kpi.targetValue) || 0,
            ...(kpi.unit.trim() ? { unit: kpi.unit.trim() } : {}),
            weight: Number(kpi.weight) || 0,
          }));
        if (rows.length > 0) payload.kpis = rows;
      }

      await onSubmit(payload);
      onSaved();
    } catch (error) {
      toast.error(toMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={goal ? 'Edit goal' : 'New goal'}
      description={
        goal
          ? 'Update the goal and record how far along each KPI is.'
          : 'KPI weights share a 100 point budget with the goal.'
      }
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} disabled={!title.trim()} onClick={() => void submit()}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          {showEmployeePicker && !goal ? (
            <Select
              label="For"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              placeholder="Myself"
              options={employees}
            />
          ) : null}
          <Select
            label="Type"
            value={type}
            onChange={(event) => setType(event.target.value as GoalType)}
            options={GOAL_TYPES}
          />
          <Select
            label="Weight"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            options={[0, 10, 20, 25, 30, 40, 50, 60, 75, 100].map((value) => ({
              value: String(value),
              label: `${value}%`,
            }))}
          />
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          {goal ? (
            <>
              <Select
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as GoalStatus)}
                options={GOAL_STATUSES}
              />
              <Input
                label="Progress"
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(event) => setProgress(event.target.value)}
                hint="Setting this to 100 completes the goal."
              />
            </>
          ) : null}
        </div>

        <Textarea
          label="Description"
          value={description}
          placeholder="What does success look like?"
          onChange={(event) => setDescription(event.target.value)}
        />

        {goal && kpiProgress.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Target className="h-4 w-4" aria-hidden />
              KPI progress
            </p>
            {kpiProgress.map((kpi, index) => (
              <div key={kpi.id} className="flex items-end gap-3 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{kpi.title}</p>
                  <p className="text-xs text-slate-500">
                    Target {kpi.targetValue}
                    {kpi.unit ? ` ${kpi.unit}` : ''} · weight {kpi.weight}%
                  </p>
                </div>
                <Input
                  label="Current"
                  type="number"
                  min={0}
                  className="w-28"
                  value={String(kpiProgress[index]?.currentValue ?? '')}
                  onChange={(event) =>
                    setKpiProgress((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, currentValue: Number(event.target.value) } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        {!goal ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Target className="h-4 w-4" aria-hidden />
                Key results
              </p>
              <Button variant="subtle" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addKpi}>
                Add KPI
              </Button>
            </div>

            {kpis.map((kpi, index) => (
              <div key={`kpi-${index}`} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <Input
                  label="KPI"
                  value={kpi.title}
                  placeholder="e.g. Reviews closed"
                  onChange={(event) =>
                    setKpis((rows) =>
                      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, title: event.target.value } : row)),
                    )
                  }
                />
                <Input
                  label="Target"
                  type="number"
                  min={0}
                  value={kpi.targetValue}
                  onChange={(event) =>
                    setKpis((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, targetValue: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Input
                  label="Unit"
                  value={kpi.unit}
                  placeholder="optional"
                  onChange={(event) =>
                    setKpis((rows) =>
                      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, unit: event.target.value } : row)),
                    )
                  }
                />
                <Input
                  label="Weight %"
                  type="number"
                  min={0}
                  max={100}
                  value={kpi.weight}
                  onChange={(event) =>
                    setKpis((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, weight: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove KPI"
                  onClick={() => setKpis((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
