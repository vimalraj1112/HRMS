import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { createLeaveType, deleteLeaveType, listLeaveTypes, updateLeaveType } from '@/services/leave.service';
import type { LeaveType, LeaveTypePayload, LeaveUnit } from '@/types/time';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  code: z
    .string()
    .trim()
    .min(2, 'Code needs at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes or underscores only'),
  unit: z.enum(['DAYS', 'HOURS']),
  annualQuota: z.coerce.number().min(0, 'Quota cannot be negative'),
  minDaysNotice: z.coerce.number().int('Notice must be whole days').min(0, 'Notice cannot be negative').max(365),
  maxCarryForward: z.coerce.number().min(0, 'Carry forward cannot be negative'),
  isPaid: z.boolean(),
  allowsCarryForward: z.boolean(),
  requiresDocument: z.boolean(),
  isActive: z.boolean(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour such as #3b82f6')
    .optional()
    .or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  code: '',
  unit: 'DAYS',
  annualQuota: 12,
  minDaysNotice: 1,
  maxCarryForward: 0,
  isPaid: true,
  allowsCarryForward: false,
  requiresDocument: false,
  isActive: true,
  color: '#3b82f6',
  description: '',
};

export function LeaveTypesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [removing, setRemoving] = useState<LeaveType | null>(null);

  const types = useQuery({
    queryKey: ['leave-types', 'list', { page, search, includeInactive }],
    queryFn: () => listLeaveTypes({ page, limit: 20, search: search || undefined, includeInactive, sortBy: 'name', sortOrder: 'asc' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: LeaveTypePayload = {
        name: values.name,
        code: values.code,
        unit: values.unit,
        annualQuota: values.annualQuota,
        minDaysNotice: values.minDaysNotice,
        maxCarryForward: values.allowsCarryForward ? values.maxCarryForward : 0,
        isPaid: values.isPaid,
        allowsCarryForward: values.allowsCarryForward,
        requiresDocument: values.requiresDocument,
        isActive: values.isActive,
        ...(values.color ? { color: values.color } : {}),
        ...(values.description ? { description: values.description } : {}),
      };
      return editing ? updateLeaveType(editing.id, payload) : createLeaveType(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Leave type updated' : 'Leave type created');
      setCreating(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLeaveType(id),
    onSuccess: () => {
      toast.success('Leave type deleted');
      setRemoving(null);
      invalidate();
    },
    onError: (error) => {
      setRemoving(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<LeaveType>[] = [
    {
      key: 'name',
      header: 'Leave type',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color ?? '#cbd5e1' }} aria-hidden />
          <div>
            <p className="font-medium text-slate-900">{row.name}</p>
            <p className="text-xs text-slate-500">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'quota',
      header: 'Annual quota',
      render: (row) => (
        <span className="text-slate-700">
          {row.annualQuota} {row.unit === 'HOURS' ? 'hours' : 'days'}
        </span>
      ),
    },
    { key: 'notice', header: 'Min notice', render: (row) => <span className="text-slate-700">{row.minDaysNotice} day(s)</span> },
    {
      key: 'flags',
      header: 'Flags',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.isPaid ? <Badge tone="success">Paid</Badge> : <Badge>Unpaid</Badge>}
          {row.allowsCarryForward ? <Badge tone="info">Carry forward</Badge> : null}
          {row.requiresDocument ? <Badge tone="warning">Document</Badge> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} onClick={() => setRemoving(row)}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leave Types"
        description="Policy for each leave type: quota, notice period and carry forward rules."
        actions={
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setCreating(true);
              save.reset();
            }}
          >
            New leave type
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(searchDraft.trim());
            }}
          >
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search leave types"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>
          <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => {
                setPage(1);
                setIncludeInactive(event.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Show inactive
          </label>
          <Button
            variant="secondary"
            onClick={() => {
              setPage(1);
              setSearch(searchDraft.trim());
            }}
          >
            Search
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={types.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={types.isPending}
          isFetching={types.isFetching}
          error={types.error}
          onRetry={() => void types.refetch()}
          emptyTitle="No leave types found"
          emptyDescription="Create a leave type to let employees request time off."
          emptyAction={
            <Button size="sm" onClick={() => setCreating(true)}>
              New leave type
            </Button>
          }
          footer={<Pagination meta={types.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {creating || editing !== null ? (
        <LeaveTypeDialog
          key={editing?.id ?? 'new'}
          leaveType={editing}
          isSubmitting={save.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Delete leave type"
        message={
          removing
            ? `Delete ${removing.name}? Types that already have requests or used balance can only be deactivated.`
            : ''
        }
        confirmLabel="Delete"
        isLoading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

function LeaveTypeDialog({
  leaveType,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  leaveType: LeaveType | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    leaveType
      ? {
          name: leaveType.name,
          code: leaveType.code,
          unit: leaveType.unit,
          annualQuota: leaveType.annualQuota,
          minDaysNotice: leaveType.minDaysNotice,
          maxCarryForward: leaveType.maxCarryForward,
          isPaid: leaveType.isPaid,
          allowsCarryForward: leaveType.allowsCarryForward,
          requiresDocument: leaveType.requiresDocument,
          isActive: leaveType.isActive,
          color: leaveType.color ?? '',
          description: leaveType.description ?? '',
        }
      : emptyValues,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const result = schema.safeParse(values);
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
      title={leaveType ? `Edit ${leaveType.name}` : 'New leave type'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            {leaveType ? 'Save changes' : 'Create leave type'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Name"
            value={values.name}
            error={errors.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
          <Input
            label="Code"
            value={values.code}
            error={errors.code}
            onChange={(event) => setValues({ ...values, code: event.target.value.toUpperCase() })}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Unit"
            value={values.unit}
            options={[
              { value: 'DAYS', label: 'Days' },
              { value: 'HOURS', label: 'Hours' },
            ]}
            onChange={(event) => setValues({ ...values, unit: event.target.value as LeaveUnit })}
          />
          <Input
            label="Annual quota"
            type="number"
            min={0}
            step="0.5"
            value={values.annualQuota}
            error={errors.annualQuota}
            onChange={(event) => setValues({ ...values, annualQuota: Number(event.target.value) })}
          />
          <Input
            label="Min notice (days)"
            type="number"
            min={0}
            value={values.minDaysNotice}
            error={errors.minDaysNotice}
            onChange={(event) => setValues({ ...values, minDaysNotice: Number(event.target.value) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Colour"
            type="color"
            value={values.color || '#3b82f6'}
            error={errors.color}
            onChange={(event) => setValues({ ...values, color: event.target.value })}
          />
          <Input
            label="Max carry forward"
            type="number"
            min={0}
            step="0.5"
            disabled={!values.allowsCarryForward}
            value={values.maxCarryForward}
            error={errors.maxCarryForward}
            onChange={(event) => setValues({ ...values, maxCarryForward: Number(event.target.value) })}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['isPaid', 'Paid leave'],
              ['allowsCarryForward', 'Allow carry forward'],
              ['requiresDocument', 'Requires document'],
              ['isActive', 'Active'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={values[key]}
                onChange={(event) => setValues({ ...values, [key]: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {label}
            </label>
          ))}
        </div>

        <Textarea
          label="Description"
          value={values.description}
          error={errors.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
        />
      </div>
    </Modal>
  );
}
