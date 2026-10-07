import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { createDesignation, deleteDesignation, listDesignations, updateDesignation } from '@/services/organization.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Designation } from '@/types/hr';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Code needs at least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes or underscores only'),
  level: z.coerce.number().int('Level must be a whole number').min(1, 'Level starts at 1').max(20, 'Level cannot exceed 20'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = { name: '', code: '', level: 1, description: '' };

export function DesignationsPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canManage = can(role, 'designation:manage');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Designation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const designations = useQuery({
    queryKey: ['designations', 'list', { page, search, includeInactive }],
    queryFn: () => listDesignations({ page, limit: 20, search, includeInactive, sortBy: 'name', sortOrder: 'asc' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['designations'] });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name,
        code: values.code,
        level: values.level,
        ...(values.description ? { description: values.description } : {}),
      };
      return editing ? updateDesignation(editing.id, payload) : createDesignation(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Designation updated' : 'Designation created');
      setCreating(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => {
      setFormError(toMessage(error));
      toast.error(toMessage(error));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDesignation(id),
    onSuccess: () => {
      toast.success('Designation deleted');
      setRemoving(null);
      invalidate();
    },
    onError: (error) => {
      setRemoving(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<Designation>[] = [
    {
      key: 'name',
      header: 'Designation',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">{row.code}</p>
        </div>
      ),
    },
    { key: 'level', header: 'Level', render: (row) => <Badge tone="info">L{row.level}</Badge> },
    { key: 'employees', header: 'Employees', render: (row) => <span className="text-slate-700">{row._count.employees}</span> },
    {
      key: 'description',
      header: 'Description',
      className: 'max-w-xs truncate text-slate-600',
      render: (row) => row.description ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: Designation) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${row.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(row);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${row.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRemoving(row);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ),
          } satisfies Column<Designation>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Designations"
        description="Job titles and seniority levels used across the organisation."
        actions={
          canManage ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setFormError(null);
                setCreating(true);
              }}
            >
              New designation
            </Button>
          ) : null
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
              placeholder="Search designations"
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
          rows={designations.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={designations.isPending}
          isFetching={designations.isFetching}
          error={designations.error}
          onRetry={() => void designations.refetch()}
          emptyTitle="No designations found"
          emptyDescription={canManage ? 'Create your first designation to assign to employees.' : undefined}
          emptyAction={
            canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                New designation
              </Button>
            ) : null
          }
          footer={<Pagination meta={designations.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {creating || editing !== null ? (
        <DesignationDialog
          key={editing?.id ?? 'new'}
          designation={editing}
          formError={formError}
          isSubmitting={save.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setFormError(null);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Delete designation"
        message={
          removing
            ? `Delete ${removing.name}? Designations still assigned to employees cannot be deleted.`
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

function DesignationDialog({
  designation,
  formError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  designation: Designation | null;
  formError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    designation
      ? { name: designation.name, code: designation.code, level: designation.level, description: designation.description ?? '' }
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
      title={designation ? `Edit ${designation.name}` : 'New designation'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            {designation ? 'Save changes' : 'Create designation'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p> : null}
        <Input
          label="Name"
          value={values.name}
          error={errors.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code"
            value={values.code}
            error={errors.code}
            onChange={(event) => setValues({ ...values, code: event.target.value.toUpperCase() })}
          />
          <Input
            label="Level"
            type="number"
            min={1}
            max={20}
            value={values.level}
            error={errors.level}
            onChange={(event) => setValues({ ...values, level: Number(event.target.value) })}
          />
        </div>
        <Textarea
          label="Description"
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
        />
      </div>
    </Modal>
  );
}
