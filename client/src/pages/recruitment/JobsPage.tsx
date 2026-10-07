import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { formatCurrency, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import { listDepartments, listDesignations } from '@/services/organization.service';
import { createJob, deleteJob, listJobs, updateJob } from '@/services/recruitment.service';
import {
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  type EmploymentType,
  type JobOpening,
  type JobPayload,
  type JobStatus,
} from '@/types/recruitment';
import { canManageJobs } from './access';

const statusLabel = (status: JobStatus) => status.replace(/_/g, ' ');

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
  CONSULTANT: 'Consultant',
};

export function JobsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const canManage = canManageJobs(role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [editing, setEditing] = useState<JobOpening | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<JobOpening | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'jobs'] });
  };

  const jobs = useQuery({
    queryKey: ['recruitment', 'jobs', 'list', { page, search, status, departmentId }],
    queryFn: () =>
      listJobs({
        page,
        limit: 20,
        search: search || undefined,
        status: (status || undefined) as JobStatus | undefined,
        departmentId: departmentId || undefined,
      }),
  });

  const departments = useQuery({
    queryKey: ['recruitment', 'departments'],
    queryFn: () => listDepartments({ limit: 100, sortOrder: 'asc' }),
  });

  const designations = useQuery({
    queryKey: ['recruitment', 'designations'],
    enabled: creating || editing !== null,
    queryFn: () => listDesignations({ limit: 100, sortOrder: 'asc' }),
  });

  const employees = useQuery({
    queryKey: ['recruitment', 'employees'],
    enabled: creating || editing !== null,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: (job) => {
      toast.success(`"${job.title}" created`);
      setCreating(false);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: Partial<JobPayload> }) => updateJob(input.id, input.payload),
    onSuccess: (job) => {
      toast.success(`"${job.title}" updated`);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      toast.success('Job opening deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const transition = (job: JobOpening, payload: Partial<JobPayload>, message: string) => {
    updateMutation.mutate(
      { id: job.id, payload },
      {
        onSuccess: () => toast.success(message),
        onError: (error) => toast.error(toMessage(error)),
      },
    );
  };

  const columns: Column<JobOpening>[] = (() => {
    const base: Column<JobOpening>[] = [
      {
        key: 'title',
        header: 'Role',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.title}</p>
            <p className="truncate text-xs text-slate-500">
              {row.department?.name ?? 'All departments'}
              {row.location ? ` · ${row.location}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        render: (row) => <span className="text-slate-700">{EMPLOYMENT_TYPE_LABELS[row.employmentType]}</span>,
      },
      {
        key: 'openings',
        header: 'Openings',
        render: (row) => (
          <span className="text-slate-700">
            {row.openingsCount}
            {row._count ? <span className="text-slate-400"> · {row._count.candidates} applied</span> : null}
          </span>
        ),
      },
      {
        key: 'salary',
        header: 'Salary',
        render: (row) =>
          row.salaryMin === null && row.salaryMax === null ? (
            <span className="text-slate-400">Not disclosed</span>
          ) : (
            <span className="text-slate-700">
              {formatCurrency(row.salaryMin)}
              {' – '}
              {formatCurrency(row.salaryMax)}
            </span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <div className="flex flex-col gap-1">
            <StatusBadge status={row.status} />
            {row.publishedAt ? <span className="text-xs text-slate-400">Since {row.publishedAt.slice(0, 10)}</span> : null}
          </div>
        ),
      },
    ];

    if (!canManage) return base;

    base.push({
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'DRAFT' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                transition(row, { status: 'OPEN', publishedAt: row.publishedAt ?? new Date().toISOString() }, 'Job published')
              }
            >
              Publish
            </Button>
          ) : null}
          {row.status === 'OPEN' ? (
            <Button variant="ghost" size="sm" onClick={() => transition(row, { status: 'ON_HOLD' }, 'Job put on hold')}>
              Hold
            </Button>
          ) : null}
          {row.status === 'ON_HOLD' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                transition(row, { status: 'OPEN', publishedAt: row.publishedAt ?? new Date().toISOString() }, 'Job resumed')
              }
            >
              Resume
            </Button>
          ) : null}
          {row.status === 'OPEN' || row.status === 'ON_HOLD' ? (
            <Button variant="ghost" size="sm" onClick={() => transition(row, { status: 'CLOSED' }, 'Job closed')}>
              Close
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(row)}
            leftIcon={<Pencil className="h-4 w-4" />}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(row)} leftIcon={<Trash2 className="h-4 w-4" />}>
            Delete
          </Button>
        </div>
      ),
    });

    return base;
  })();

  return (
    <>
      <PageHeader
        title="Job openings"
        description="Publish, pause and close the roles your team is hiring for."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New job opening
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <div className="w-64">
            <Input
              label="Search"
              placeholder="Role title"
              value={search}
              leftSlot={<Search className="h-4 w-4" />}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </div>
          <div className="w-44">
            <Select
              label="Status"
              placeholder="All statuses"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              options={JOB_STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
            />
          </div>
          <div className="w-56">
            <Select
              label="Department"
              placeholder="All departments"
              value={departmentId}
              onChange={(event) => {
                setPage(1);
                setDepartmentId(event.target.value);
              }}
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={jobs.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={jobs.isPending}
          isFetching={jobs.isFetching}
          error={jobs.error}
          onRetry={() => void jobs.refetch()}
          emptyTitle="No job openings"
          emptyDescription="Create your first job opening to start collecting candidates."
          emptyAction={
            canManage ? (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                New job opening
              </Button>
            ) : undefined
          }
        />
        <Pagination meta={jobs.data?.meta} onPageChange={setPage} />
      </Card>

      {creating || editing ? (
        <JobFormDialog
          job={editing}
          departments={(departments.data?.items ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
          designations={(designations.data?.items ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
          employees={(employees.data?.items ?? []).map((entry) => ({
            value: entry.id,
            label: fullName(entry) || entry.email,
          }))}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(payload) => {
            if (editing) updateMutation.mutate({ id: editing.id, payload });
            else createMutation.mutate(payload);
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open
          tone="danger"
          title="Delete job opening?"
          message={`"${deleting.title}" will be removed permanently. This cannot be undone.`}
          confirmLabel="Delete"
          isLoading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
}

interface JobFormDialogProps {
  job: JobOpening | null;
  departments: { value: string; label: string }[];
  designations: { value: string; label: string }[];
  employees: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: JobPayload) => void;
}

function JobFormDialog({ job, departments, designations, employees, isSubmitting, onCancel, onSubmit }: JobFormDialogProps) {
  const [title, setTitle] = useState(job?.title ?? '');
  const [departmentId, setDepartmentId] = useState(job?.departmentId ?? '');
  const [designationId, setDesignationId] = useState(job?.designationId ?? '');
  const [hiringManagerId, setHiringManagerId] = useState(job?.hiringManagerId ?? '');
  const [location, setLocation] = useState(job?.location ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(job?.employmentType ?? 'FULL_TIME');
  const [openingsCount, setOpeningsCount] = useState(String(job?.openingsCount ?? 1));
  const [minExperience, setMinExperience] = useState(job?.minExperience === null ? '' : String(job?.minExperience ?? ''));
  const [maxExperience, setMaxExperience] = useState(job?.maxExperience === null ? '' : String(job?.maxExperience ?? ''));
  const [salaryMin, setSalaryMin] = useState(job?.salaryMin === null ? '' : String(job?.salaryMin ?? ''));
  const [salaryMax, setSalaryMax] = useState(job?.salaryMax === null ? '' : String(job?.salaryMax ?? ''));
  const [publishedAt, setPublishedAt] = useState(() => {
    if (!job?.publishedAt) return '';
    const date = new Date(job.publishedAt);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  const [initialStatus, setInitialStatus] = useState<JobStatus>('DRAFT');
  const [description, setDescription] = useState(job?.description ?? '');
  const [requirements, setRequirements] = useState(job?.requirements ?? '');

  const submit = () => {
    const publishedIso = publishedAt ? new Date(publishedAt).toISOString() : undefined;
    const wantsOpen = job ? job.status !== 'DRAFT' : initialStatus === 'OPEN';

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
      hiringManagerId: hiringManagerId || undefined,
      location: location.trim() || undefined,
      employmentType,
      openingsCount: Number(openingsCount) || 1,
      minExperience: minExperience === '' ? undefined : Number(minExperience),
      maxExperience: maxExperience === '' ? undefined : Number(maxExperience),
      salaryMin: salaryMin === '' ? undefined : Number(salaryMin),
      salaryMax: salaryMax === '' ? undefined : Number(salaryMax),
      publishedAt: publishedIso ?? (wantsOpen ? new Date().toISOString() : undefined),
      requirements: requirements.trim() || undefined,
      ...(job ? {} : { status: initialStatus }),
    });
  };

  return (
    <Modal
      open
      title={job ? 'Edit job opening' : 'New job opening'}
      onClose={onCancel}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button onClick={submit} isLoading={isSubmitting} disabled={title.trim().length < 2 || description.trim().length < 2}>
            {job ? 'Save changes' : 'Create job'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Role title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Senior Frontend Engineer"
            maxLength={160}
            required
          />
        </div>
        <Select
          label="Department"
          name="departmentId"
          placeholder="Not tied to a department"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          options={departments}
        />
        <Select
          label="Designation"
          name="designationId"
          placeholder="No designation"
          value={designationId}
          onChange={(event) => setDesignationId(event.target.value)}
          options={designations}
        />
        <Select
          label="Hiring manager"
          name="hiringManagerId"
          placeholder="Unassigned"
          value={hiringManagerId}
          onChange={(event) => setHiringManagerId(event.target.value)}
          options={employees}
        />
        <Input
          label="Location"
          name="location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="e.g. Bengaluru / Remote"
          maxLength={120}
        />
        <Select
          label="Employment type"
          name="employmentType"
          value={employmentType}
          onChange={(event) => setEmploymentType(event.target.value as EmploymentType)}
          options={EMPLOYMENT_TYPES.map((value) => ({
            value,
            label: EMPLOYMENT_TYPE_LABELS[value],
          }))}
        />
        <Input
          label="Openings"
          name="openingsCount"
          type="number"
          min={1}
          value={openingsCount}
          onChange={(event) => setOpeningsCount(event.target.value)}
        />
        <Input
          label="Minimum experience (years)"
          name="minExperience"
          type="number"
          min={0}
          value={minExperience}
          onChange={(event) => setMinExperience(event.target.value)}
        />
        <Input
          label="Maximum experience (years)"
          name="maxExperience"
          type="number"
          min={0}
          value={maxExperience}
          onChange={(event) => setMaxExperience(event.target.value)}
        />
        <Input
          label="Budget from (₹)"
          name="salaryMin"
          type="number"
          min={0}
          value={salaryMin}
          onChange={(event) => setSalaryMin(event.target.value)}
        />
        <Input
          label="Budget to (₹)"
          name="salaryMax"
          type="number"
          min={0}
          value={salaryMax}
          onChange={(event) => setSalaryMax(event.target.value)}
        />
        <Input
          label="Publish on"
          name="publishedAt"
          type="datetime-local"
          hint="Required before the role can go live."
          value={publishedAt}
          onChange={(event) => setPublishedAt(event.target.value)}
        />
        {job ? null : (
          <Select
            label="Initial status"
            name="status"
            value={initialStatus}
            onChange={(event) => setInitialStatus(event.target.value as JobStatus)}
            options={[
              { value: 'DRAFT', label: 'Draft' },
              { value: 'OPEN', label: 'Open' },
            ]}
          />
        )}
        <div className="sm:col-span-2">
          <Textarea
            label="Description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What will this person own?"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Textarea
            label="Requirements"
            name="requirements"
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
            placeholder="Skills, experience and qualifications."
          />
        </div>
      </div>
    </Modal>
  );
}
