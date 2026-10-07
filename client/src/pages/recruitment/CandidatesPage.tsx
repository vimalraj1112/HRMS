import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Search, Trash2, Upload, UserCheck } from 'lucide-react';
import { useRef, useState } from 'react';
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
import {
  createCandidate,
  deleteCandidate,
  downloadResume,
  listCandidates,
  listJobs,
  updateCandidate,
  uploadResume,
} from '@/services/recruitment.service';
import {
  CANDIDATE_STATUSES,
  type Candidate,
  type CandidatePayload,
  type CandidateStatus,
  type CandidateUpdatePayload,
} from '@/types/recruitment';
import { canManageCandidates } from './access';

const statusLabel = (status: CandidateStatus) => status.replace(/_/g, ' ');

/**
 * Mirrors the server side pipeline so the status picker only offers moves that
 * will actually be accepted.
 */
const CANDIDATE_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  APPLIED: ['SCREENING', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'WITHDRAWN'],
  INTERVIEW: ['SELECTED', 'REJECTED', 'OFFERED', 'WITHDRAWN'],
  SELECTED: ['HIRED', 'WITHDRAWN'],
  OFFERED: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  HIRED: [],
  WITHDRAWN: [],
};

export function CandidatesPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const canManage = canManageCandidates(role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [jobOpeningId, setJobOpeningId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [moving, setMoving] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  const [resumeTarget, setResumeTarget] = useState<Candidate | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'candidates'] });
  };

  const candidates = useQuery({
    queryKey: ['recruitment', 'candidates', 'list', { page, search, status, jobOpeningId }],
    queryFn: () =>
      listCandidates({
        page,
        limit: 20,
        search: search || undefined,
        status: (status || undefined) as CandidateStatus | undefined,
        jobOpeningId: jobOpeningId || undefined,
      }),
  });

  const jobs = useQuery({
    queryKey: ['recruitment', 'jobs', 'picker'],
    queryFn: () => listJobs({ limit: 100, sortOrder: 'desc' }),
  });

  const employees = useQuery({
    queryKey: ['recruitment', 'employees', 'picker'],
    enabled: creating || moving !== null,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const createMutation = useMutation({
    mutationFn: createCandidate,
    onSuccess: (candidate) => {
      toast.success(`${fullName(candidate)} added`);
      setCreating(false);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: CandidateUpdatePayload }) => updateCandidate(input.id, input.payload),
    onSuccess: (candidate) => {
      toast.success(`${fullName(candidate)} updated`);
      setEditing(null);
      setMoving(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: () => {
      toast.success('Candidate deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: { id: string; file: File }) => uploadResume(input.id, input.file),
    onSuccess: () => {
      toast.success('Resume uploaded');
      setResumeTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const handleDownload = async (row: Candidate) => {
    setDownloadingId(row.id);
    try {
      await downloadResume(row);
    } catch (error) {
      toast.error(toMessage(error));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: Column<Candidate>[] = [
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {row.firstName} {row.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Applied for',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-700">{row.jobOpening?.title ?? 'General application'}</p>
          <p className="truncate text-xs text-slate-500">
            {row.currentCompany ? `${row.currentDesignation ?? 'Employee'} at ${row.currentCompany}` : row.source ?? 'Direct'}
          </p>
        </div>
      ),
    },
    {
      key: 'experience',
      header: 'Experience',
      render: (row) => (
        <div>
          <span className="text-slate-700">{row.experienceYears === null ? '—' : `${row.experienceYears} yrs`}</span>
          {row.expectedSalary !== null ? (
            <p className="text-xs text-slate-500">Expects {formatCurrency(row.expectedSalary)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Stage',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {row.rejectionReason ? <p className="max-w-40 truncate text-xs text-slate-400">{row.rejectionReason}</p> : null}
        </div>
      ),
    },
    {
      key: 'resume',
      header: 'Resume',
      render: (row) =>
        row.hasResume ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={downloadingId === row.id}
            onClick={() => void handleDownload(row)}
            leftIcon={<FileText className="h-4 w-4" />}
          >
            {row.resumeFileName ?? 'Download'}
          </Button>
        ) : (
          <span className="text-slate-400">Not uploaded</span>
        ),
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setResumeTarget(row);
              fileRef.current?.click();
            }}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Resume
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMoving(row)}
            disabled={CANDIDATE_TRANSITIONS[row.status].length === 0}
            leftIcon={<UserCheck className="h-4 w-4" />}
          >
            Move stage
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(row)} leftIcon={<Pencil className="h-4 w-4" />}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(row)} leftIcon={<Trash2 className="h-4 w-4" />}>
            Delete
          </Button>
        </div>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Everyone in your pipeline, from first application to signed offer."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Add candidate
            </Button>
          ) : undefined
        }
      />

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (file && resumeTarget) uploadMutation.mutate({ id: resumeTarget.id, file });
        }}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <div className="w-64">
            <Input
              label="Search"
              placeholder="Name or email"
              value={search}
              leftSlot={<Search className="h-4 w-4" />}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
          </div>
          <div className="w-48">
            <Select
              label="Stage"
              placeholder="All stages"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              options={CANDIDATE_STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
            />
          </div>
          <div className="w-60">
            <Select
              label="Job opening"
              placeholder="All openings"
              value={jobOpeningId}
              onChange={(event) => {
                setPage(1);
                setJobOpeningId(event.target.value);
              }}
              options={(jobs.data?.items ?? []).map((job) => ({ value: job.id, label: job.title }))}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={candidates.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={candidates.isPending}
          isFetching={candidates.isFetching}
          error={candidates.error}
          onRetry={() => void candidates.refetch()}
          emptyTitle="No candidates yet"
          emptyDescription="Add a candidate manually or collect them through your job openings."
          emptyAction={
            canManage ? (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Add candidate
              </Button>
            ) : undefined
          }
        />
        <Pagination meta={candidates.data?.meta} onPageChange={setPage} />
      </Card>

      {creating || editing ? (
        <CandidateFormDialog
          candidate={editing}
          jobs={(jobs.data?.items ?? []).map((job) => ({ value: job.id, label: job.title }))}
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

      {moving ? (
        <MoveStageDialog
          candidate={moving}
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee) || employee.email,
          }))}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setMoving(null)}
          onSubmit={(payload) => updateMutation.mutate({ id: moving.id, payload })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open
          tone="danger"
          title="Delete candidate?"
          message={`${deleting.firstName} ${deleting.lastName} and their interview history will be removed permanently.`}
          confirmLabel="Delete"
          isLoading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
}

interface CandidateFormDialogProps {
  candidate: Candidate | null;
  jobs: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: CandidatePayload) => void;
}

function CandidateFormDialog({ candidate, jobs, isSubmitting, onCancel, onSubmit }: CandidateFormDialogProps) {
  const [firstName, setFirstName] = useState(candidate?.firstName ?? '');
  const [lastName, setLastName] = useState(candidate?.lastName ?? '');
  const [email, setEmail] = useState(candidate?.email ?? '');
  const [phone, setPhone] = useState(candidate?.phone ?? '');
  const [jobOpeningId, setJobOpeningId] = useState(candidate?.jobOpeningId ?? '');
  const [currentCompany, setCurrentCompany] = useState(candidate?.currentCompany ?? '');
  const [currentDesignation, setCurrentDesignation] = useState(candidate?.currentDesignation ?? '');
  const [experienceYears, setExperienceYears] = useState(
    candidate?.experienceYears === null ? '' : String(candidate?.experienceYears ?? ''),
  );
  const [expectedSalary, setExpectedSalary] = useState(
    candidate?.expectedSalary === null ? '' : String(candidate?.expectedSalary ?? ''),
  );
  const [source, setSource] = useState(candidate?.source ?? '');
  const [notes, setNotes] = useState(candidate?.notes ?? '');

  const submit = () => {
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      jobOpeningId: jobOpeningId || undefined,
      currentCompany: currentCompany.trim() || undefined,
      currentDesignation: currentDesignation.trim() || undefined,
      experienceYears: experienceYears === '' ? undefined : Number(experienceYears),
      expectedSalary: expectedSalary === '' ? undefined : Number(expectedSalary),
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 3;

  return (
    <Modal
      open
      title={candidate ? 'Edit candidate' : 'Add candidate'}
      onClose={onCancel}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button onClick={submit} isLoading={isSubmitting} disabled={!valid}>
            {candidate ? 'Save changes' : 'Add candidate'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="First name" name="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        <Input label="Last name" name="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        <Input label="Email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Input label="Phone" name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" />
        <Select
          label="Job opening"
          name="jobOpeningId"
          placeholder="General application"
          value={jobOpeningId}
          onChange={(event) => setJobOpeningId(event.target.value)}
          options={jobs}
        />
        <Select
          label="Source"
          name="source"
          placeholder="How did they apply?"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          options={[
            { value: 'Referral', label: 'Referral' },
            { value: 'Job board', label: 'Job board' },
            { value: 'Careers page', label: 'Careers page' },
            { value: 'Agency', label: 'Agency' },
            { value: 'LinkedIn', label: 'LinkedIn' },
          ]}
        />
        <Input
          label="Current company"
          name="currentCompany"
          value={currentCompany}
          onChange={(event) => setCurrentCompany(event.target.value)}
        />
        <Input
          label="Current designation"
          name="currentDesignation"
          value={currentDesignation}
          onChange={(event) => setCurrentDesignation(event.target.value)}
        />
        <Input
          label="Experience (years)"
          name="experienceYears"
          type="number"
          min={0}
          step="0.5"
          value={experienceYears}
          onChange={(event) => setExperienceYears(event.target.value)}
        />
        <Input
          label="Expected salary (₹)"
          name="expectedSalary"
          type="number"
          min={0}
          value={expectedSalary}
          onChange={(event) => setExpectedSalary(event.target.value)}
        />
        <div className="sm:col-span-2">
          <Textarea label="Notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

interface MoveStageDialogProps {
  candidate: Candidate;
  employees: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: CandidateUpdatePayload) => void;
}

function MoveStageDialog({ candidate, employees, isSubmitting, onCancel, onSubmit }: MoveStageDialogProps) {
  const options = CANDIDATE_TRANSITIONS[candidate.status];
  const [status, setStatus] = useState<CandidateStatus>(options[0] ?? candidate.status);
  const [rejectionReason, setRejectionReason] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const needsReason = status === 'REJECTED';
  const needsEmployee = status === 'HIRED';
  const valid = (!needsReason || rejectionReason.trim().length > 0) && (!needsEmployee || employeeId !== '');

  return (
    <Modal
      open
      title={`Move ${candidate.firstName} ${candidate.lastName}`}
      description={`Currently in ${statusLabel(candidate.status)}`}
      onClose={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={options.length === 0 || !valid}
            onClick={() =>
              onSubmit({
                status,
                rejectionReason: needsReason ? rejectionReason.trim() : undefined,
                employeeId: needsEmployee ? employeeId : undefined,
              })
            }
          >
            Move stage
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="New stage"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as CandidateStatus)}
          options={options.map((value) => ({ value, label: statusLabel(value) }))}
        />
        {needsReason ? (
          <Textarea
            label="Rejection reason"
            name="rejectionReason"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            error={rejectionReason.trim().length === 0 ? 'A reason is required when rejecting a candidate.' : undefined}
            required
          />
        ) : null}
        {needsEmployee ? (
          <Select
            label="Link to employee record"
            name="employeeId"
            placeholder="Select the hired employee"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            options={employees}
            error={employeeId === '' ? 'Pick the employee record this hire maps to.' : undefined}
          />
        ) : null}
        {options.length === 0 ? <p className="text-sm text-slate-500">This candidate has reached a final stage.</p> : null}
      </div>
    </Modal>
  );
}
