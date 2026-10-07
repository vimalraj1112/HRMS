import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Pencil, Plus, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import {
  acknowledgeReview,
  createReview,
  listReviews,
  submitReview,
  updateReview,
} from '@/services/performance.service';
import {
  REVIEW_PERIODS,
  REVIEW_STATUSES,
  type PerformanceReview,
  type ReviewPayload,
  type ReviewPeriod,
  type ReviewStatus,
} from '@/types/performance';

const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }, ...REVIEW_STATUSES];
const PERIOD_OPTIONS = [{ value: '', label: 'All periods' }, ...REVIEW_PERIODS];

const rating = (value: number | null): string => (value === null ? '-' : value.toFixed(2));

export function ReviewsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const myEmployeeId = useAuthStore((state) => state.user?.employee?.id ?? null);
  const queryClient = useQueryClient();

  const canManage = can(role, 'review:manage:team') || can(role, 'review:manage:any');

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PerformanceReview | null>(null);
  const [submitting, setSubmitting] = useState<PerformanceReview | null>(null);
  const [acknowledging, setAcknowledging] = useState<PerformanceReview | null>(null);
  const [viewing, setViewing] = useState<PerformanceReview | null>(null);

  const reviews = useQuery({
    queryKey: ['performance', 'reviews', { page, status, period }],
    queryFn: () =>
      listReviews({
        page,
        limit: 20,
        status: (status || undefined) as ReviewStatus | undefined,
        period: (period || undefined) as ReviewPeriod | undefined,
        sortBy: 'periodEnd',
        sortOrder: 'desc',
      }),
  });

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    enabled: canManage,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['performance'] });
  };

  const closeAndInvalidate = (message: string, close: () => void) => {
    toast.success(message);
    close();
    invalidate();
  };

  const columns: Column<PerformanceReview>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{fullName(row.employee)}</p>
          <p className="text-xs text-slate-500">
            {row.employee.department?.name ?? row.employee.employeeCode} · reviewed by {fullName(row.reviewer)}
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (row) => (
        <div>
          <p className="text-slate-700">
            {formatDate(row.periodStart)} - {formatDate(row.periodEnd)}
          </p>
          <p className="text-xs capitalize text-slate-500">{row.period.replace('_', ' ').toLowerCase()}</p>
        </div>
      ),
    },
    {
      key: 'ratings',
      header: 'Ratings',
      render: (row) => (
        <div className="text-sm tabular-nums text-slate-600">
          <span className="font-medium text-slate-900">{rating(row.overallRating)}</span>
          <span className="text-xs text-slate-500"> (self {rating(row.selfRating)} · mgr {rating(row.managerRating)})</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => {
        const isSubject = myEmployeeId !== null && row.employeeId === myEmployeeId;
        const items: ReactNode[] = [
          <Button key="view" variant="ghost" size="icon" aria-label="View review" onClick={() => setViewing(row)}>
            <Eye className="h-4 w-4" />
          </Button>,
        ];

        if (canManage && row.status === 'DRAFT') {
          items.push(
            <Button
              key="edit"
              variant="ghost"
              size="icon"
              aria-label="Edit review"
              onClick={() => setEditing(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>,
            <Button
              key="submit"
              variant="ghost"
              size="icon"
              aria-label="Submit review"
              onClick={() => setSubmitting(row)}
            >
              <Send className="h-4 w-4" />
            </Button>,
          );
        }

        if (isSubject && row.status === 'SUBMITTED') {
          items.push(
            <Button
              key="ack"
              variant="ghost"
              size="icon"
              aria-label="Acknowledge review"
              onClick={() => setAcknowledging(row)}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>,
          );
        }

        return <div className="flex justify-end gap-1">{items}</div>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Performance Reviews"
        description="Prepare, submit and acknowledge review cycles for your team."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New review
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
            label="Period"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setPage(1);
            }}
            options={PERIOD_OPTIONS}
          />
        </div>

        <DataTable
          columns={columns}
          rows={reviews.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={reviews.isPending}
          isFetching={reviews.isFetching}
          error={reviews.error}
          onRetry={() => void reviews.refetch()}
          emptyTitle="No reviews yet"
          emptyDescription="Create a review to start a new cycle."
        />

        <Pagination meta={reviews.data?.meta} onPageChange={setPage} />
      </Card>

      {creating ? (
        <ReviewDialog
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee),
          }))}
          onClose={() => setCreating(false)}
          onSubmit={(payload) => createReview(payload as unknown as ReviewPayload)}
          onSaved={() => closeAndInvalidate('Review created', () => setCreating(false))}
        />
      ) : null}

      {editing ? (
        <ReviewDialog
          review={editing}
          employees={[]}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => updateReview(editing.id, payload)}
          onSaved={() => closeAndInvalidate('Review updated', () => setEditing(null))}
        />
      ) : null}

      {viewing ? <ReviewDetail review={viewing} onClose={() => setViewing(null)} /> : null}

      {submitting ? (
        <SubmitDialog
          review={submitting}
          onClose={() => setSubmitting(null)}
          onSubmit={(payload) => submitReview(submitting.id, payload)}
          onSaved={() => closeAndInvalidate('Review submitted', () => setSubmitting(null))}
        />
      ) : null}

      {acknowledging ? (
        <AcknowledgeDialog
          review={acknowledging}
          onClose={() => setAcknowledging(null)}
          onSubmit={(payload) => acknowledgeReview(acknowledging.id, payload)}
          onSaved={() => closeAndInvalidate('Review acknowledged', () => setAcknowledging(null))}
        />
      ) : null}
    </>
  );
}

interface EmployeeOption {
  value: string;
  label: string;
}

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label={label}
      type="number"
      min={0}
      max={5}
      step={0.25}
      value={value}
      placeholder="0 - 5"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ReviewDialog({
  review,
  employees,
  onClose,
  onSubmit,
  onSaved,
}: {
  review?: PerformanceReview;
  employees: EmployeeOption[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(review?.employeeId ?? '');
  const [period, setPeriod] = useState<ReviewPeriod>(review?.period ?? 'QUARTERLY');
  const [periodStart, setPeriodStart] = useState(review?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(review?.periodEnd ?? '');
  const [selfRating, setSelfRating] = useState(review?.selfRating === null ? '' : String(review?.selfRating ?? ''));
  const [managerRating, setManagerRating] = useState(
    review?.managerRating === null ? '' : String(review?.managerRating ?? ''),
  );
  const [achievements, setAchievements] = useState(review?.achievements ?? '');
  const [strengths, setStrengths] = useState(review?.strengths ?? '');
  const [improvements, setImprovements] = useState(review?.improvements ?? '');
  const [managerComments, setManagerComments] = useState(review?.managerComments ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isNew = review === undefined;
  const canChooseEmployee = isNew && employees.length > 0;

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        period,
        periodStart,
        periodEnd,
        ...(selfRating.trim() ? { selfRating: Number(selfRating) } : {}),
        ...(managerRating.trim() ? { managerRating: Number(managerRating) } : {}),
        ...(achievements.trim() ? { achievements: achievements.trim() } : {}),
        ...(strengths.trim() ? { strengths: strengths.trim() } : {}),
        ...(improvements.trim() ? { improvements: improvements.trim() } : {}),
        ...(managerComments.trim() ? { managerComments: managerComments.trim() } : {}),
        ...(isNew ? { employeeId } : {}),
      };

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
      title={isNew ? 'New review' : 'Edit review'}
      description={isNew ? 'Ratings run from 0 to 5. The overall rating is weighted 70% manager, 30% self.' : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={!periodStart || !periodEnd || (isNew && !employeeId)}
            onClick={() => void submit()}
          >
            {isNew ? 'Create review' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {canChooseEmployee ? (
            <Select
              label="Employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              placeholder="Select an employee"
              options={employees}
            />
          ) : null}
          <Select
            label="Cycle"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReviewPeriod)}
            options={REVIEW_PERIODS}
          />
          <Input
            label="Period start"
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
          />
          <Input label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          <RatingField label="Self rating" value={selfRating} onChange={setSelfRating} />
          <RatingField label="Manager rating" value={managerRating} onChange={setManagerRating} />
        </div>

        <Textarea
          label="Achievements"
          value={achievements}
          placeholder="What did the employee deliver this cycle?"
          onChange={(event) => setAchievements(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label="Strengths"
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
          />
          <Textarea
            label="Areas to improve"
            value={improvements}
            onChange={(event) => setImprovements(event.target.value)}
          />
        </div>
        <Textarea
          label="Manager comments"
          value={managerComments}
          onChange={(event) => setManagerComments(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function SubmitDialog({
  review,
  onClose,
  onSubmit,
  onSaved,
}: {
  review: PerformanceReview;
  onClose: () => void;
  onSubmit: (payload: { managerRating?: number; managerComments?: string }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [managerRating, setManagerRating] = useState(
    review.managerRating === null ? '' : String(review.managerRating),
  );
  const [managerComments, setManagerComments] = useState(review.managerComments ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...(managerRating.trim() ? { managerRating: Number(managerRating) } : {}),
        ...(managerComments.trim() ? { managerComments: managerComments.trim() } : {}),
      });
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
      title="Submit review"
      description={`${fullName(review.employee)} · ${formatDate(review.periodStart)} - ${formatDate(review.periodEnd)}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={() => void submit()}>
            Submit review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Submitting locks the review for editing and notifies the employee that it is ready to read.
        </p>
        <RatingField label="Manager rating" value={managerRating} onChange={setManagerRating} />
        <Textarea
          label="Manager comments"
          value={managerComments}
          onChange={(event) => setManagerComments(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function AcknowledgeDialog({
  review,
  onClose,
  onSubmit,
  onSaved,
}: {
  review: PerformanceReview;
  onClose: () => void;
  onSubmit: (payload: { employeeComments?: string }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [employeeComments, setEmployeeComments] = useState(review.employeeComments ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(employeeComments.trim() ? { employeeComments: employeeComments.trim() } : {});
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
      title="Acknowledge review"
      description="Confirm you have read the review. You can add a response before acknowledging."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={() => void submit()}>
            Acknowledge
          </Button>
        </>
      }
    >
      <Textarea
        label="Your response"
        value={employeeComments}
        placeholder="Optional"
        onChange={(event) => setEmployeeComments(event.target.value)}
      />
    </Modal>
  );
}

function ReviewDetail({ review, onClose }: { review: PerformanceReview; onClose: () => void }) {
  const sections: { label: string; value: string | null }[] = [
    { label: 'Achievements', value: review.achievements },
    { label: 'Strengths', value: review.strengths },
    { label: 'Areas to improve', value: review.improvements },
    { label: 'Manager comments', value: review.managerComments },
    { label: 'Employee response', value: review.employeeComments },
  ];

  return (
    <Modal open title={fullName(review.employee)} description={`Reviewed by ${fullName(review.reviewer)}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Overall</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{rating(review.overallRating)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Self</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{rating(review.selfRating)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Manager</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{rating(review.managerRating)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <div className="mt-1">
              <StatusBadge status={review.status} />
            </div>
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{section.value || '-'}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
