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
import { can } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from '@/services/holiday.service';
import { useAuthStore } from '@/stores/auth.store';
import { HOLIDAY_TYPES, type Holiday, type HolidayPayload, type HolidayType } from '@/types/time';

const currentYear = new Date().getFullYear();

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  date: z.string().min(1, 'Pick a date'),
  type: z.enum(['PUBLIC', 'OPTIONAL', 'RESTRICTED']),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  date: `${currentYear}-01-01`,
  type: 'PUBLIC',
  description: '',
  isActive: true,
};

export function HolidaysPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canManage = can(role, 'holiday:manage');

  const [page, setPage] = useState(1);
  const [year, setYear] = useState(String(currentYear));
  const [type, setType] = useState<HolidayType | ''>('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [removing, setRemoving] = useState<Holiday | null>(null);

  const holidays = useQuery({
    queryKey: ['holidays', { page, year, type, search, includeInactive }],
    queryFn: () =>
      listHolidays({
        page,
        limit: 20,
        year: year || undefined,
        type: type || undefined,
        search: search || undefined,
        includeInactive,
        sortBy: 'date',
        sortOrder: 'asc',
      }),
  });

  const years = Array.from({ length: 4 }, (_, index) => String(currentYear - 1 + index));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['holidays'] });
    void queryClient.invalidateQueries({ queryKey: ['leaves'] });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: HolidayPayload = {
        name: values.name,
        date: values.date,
        type: values.type,
        isActive: values.isActive,
        ...(values.description ? { description: values.description } : {}),
      };
      return editing ? updateHoliday(editing.id, payload) : createHoliday(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Holiday updated' : 'Holiday created');
      setCreating(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () => {
      toast.success('Holiday removed');
      setRemoving(null);
      invalidate();
    },
    onError: (error) => {
      setRemoving(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<Holiday>[] = [
    { key: 'date', header: 'Date', render: (row) => <span className="text-slate-700">{formatDate(row.date)}</span> },
    { key: 'name', header: 'Holiday', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <Badge tone={row.type === 'PUBLIC' ? 'info' : row.type === 'OPTIONAL' ? 'purple' : 'warning'}>{row.type}</Badge>,
    },
    {
      key: 'description',
      header: 'Description',
      className: 'max-w-xs truncate text-slate-600',
      render: (row) => row.description ?? <span className="text-slate-400">—</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: Holiday) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} onClick={() => setRemoving(row)}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ),
          } satisfies Column<Holiday>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Holidays"
        description="Company holidays are excluded when working days are calculated for leave."
        actions={
          canManage ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setCreating(true);
                save.reset();
              }}
            >
              New holiday
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
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
              placeholder="Search holidays"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              value={year}
              onChange={(event) => {
                setPage(1);
                setYear(event.target.value);
              }}
              options={years.map((option) => ({ value: option, label: option }))}
              aria-label="Year"
            />
            <Select
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(event.target.value as HolidayType | '');
              }}
              options={HOLIDAY_TYPES.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="All types"
              aria-label="Type"
            />
            {canManage ? (
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
            ) : null}
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={holidays.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={holidays.isPending}
          isFetching={holidays.isFetching}
          error={holidays.error}
          onRetry={() => void holidays.refetch()}
          emptyTitle="No holidays found"
          emptyDescription="Holidays for the selected year will appear here."
          emptyAction={
            canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                New holiday
              </Button>
            ) : null
          }
          footer={<Pagination meta={holidays.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {creating || editing !== null ? (
        <HolidayDialog
          key={editing?.id ?? 'new'}
          holiday={editing}
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
        title="Delete holiday"
        message={
          removing
            ? `Delete ${removing.name} on ${formatDate(removing.date)}? Holidays with approved leave can only be deactivated.`
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

function HolidayDialog({
  holiday,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  holiday: Holiday | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    holiday
      ? {
          name: holiday.name,
          date: holiday.date.slice(0, 10),
          type: holiday.type,
          description: holiday.description ?? '',
          isActive: holiday.isActive,
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
      title={holiday ? `Edit ${holiday.name}` : 'New holiday'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            {holiday ? 'Save changes' : 'Create holiday'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={values.name}
          error={errors.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={values.date}
            error={errors.date}
            onChange={(event) => setValues({ ...values, date: event.target.value })}
          />
          <Select
            label="Type"
            value={values.type}
            error={errors.type}
            options={HOLIDAY_TYPES.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => setValues({ ...values, type: event.target.value as HolidayType })}
          />
        </div>
        <Textarea
          label="Description"
          value={values.description}
          error={errors.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => setValues({ ...values, isActive: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Active holiday
        </label>
      </div>
    </Modal>
  );
}
