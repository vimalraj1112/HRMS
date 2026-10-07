import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Pencil, Plus, Search, Star, UserX } from 'lucide-react';
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
import { formatDateTime, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import {
  createInterview,
  listCandidates,
  listInterviews,
  submitInterviewFeedback,
  updateInterview,
} from '@/services/recruitment.service';
import {
  INTERVIEW_MODES,
  INTERVIEW_RECOMMENDATIONS,
  INTERVIEW_STATUSES,
  type Interview,
  type InterviewMode,
  type InterviewPayload,
  type InterviewRecommendation,
  type InterviewStatus,
  type InterviewUpdatePayload,
} from '@/types/recruitment';
import { canManageInterviews, canSubmitFeedback } from './access';

const statusLabel = (status: InterviewStatus) => status.replace(/_/g, ' ');

const MODE_LABELS: Record<InterviewMode, string> = {
  ONSITE: 'Onsite',
  PHONE: 'Phone',
  VIDEO: 'Video call',
};

const RECOMMENDATION_LABELS: Record<InterviewRecommendation, string> = {
  STRONG_HIRE: 'Strong hire',
  HIRE: 'Hire',
  NO_HIRE: 'No hire',
  STRONG_NO_HIRE: 'Strong no hire',
};

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function InterviewsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const canManage = canManageInterviews(role);
  const canFeedback = canSubmitFeedback(role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [scheduling, setScheduling] = useState<{ interview: Interview | null } | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);
  const [cancelling, setCancelling] = useState<Interview | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'interviews'] });
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'candidates'] });
  };

  const interviews = useQuery({
    queryKey: ['recruitment', 'interviews', 'list', { page, search, status }],
    queryFn: () =>
      listInterviews({
        page,
        limit: 20,
        search: search || undefined,
        status: (status || undefined) as InterviewStatus | undefined,
      }),
  });

  const candidates = useQuery({
    queryKey: ['recruitment', 'candidates', 'picker'],
    enabled: scheduling !== null,
    queryFn: () => listCandidates({ limit: 100, sortOrder: 'desc' }),
  });

  const employees = useQuery({
    queryKey: ['recruitment', 'employees', 'picker'],
    enabled: scheduling !== null,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const createMutation = useMutation({
    mutationFn: createInterview,
    onSuccess: (interview) => {
      toast.success(`Round ${interview.round} scheduled for ${interview.candidate.firstName} ${interview.candidate.lastName}`);
      setScheduling(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: InterviewUpdatePayload }) => updateInterview(input.id, input.payload),
    onSuccess: (interview) => {
      toast.success(interview.status === 'SCHEDULED' ? 'Interview rescheduled' : 'Interview updated');
      setScheduling(null);
      setCancelling(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const feedbackMutation = useMutation({
    mutationFn: (input: { id: string; payload: Parameters<typeof submitInterviewFeedback>[1] }) =>
      submitInterviewFeedback(input.id, input.payload),
    onSuccess: () => {
      toast.success('Feedback recorded');
      setFeedbackFor(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const columns: Column<Interview>[] = [
    {
      key: 'candidate',
      header: 'Candidate',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {row.candidate.firstName} {row.candidate.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">
            {row.candidate.jobOpening?.title ?? 'General application'} · {row.candidate.email}
          </p>
        </div>
      ),
    },
    {
      key: 'round',
      header: 'Round',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-slate-700">Round {row.round} · {MODE_LABELS[row.mode]}</p>
          {row.locationOrLink ? <p className="truncate text-xs text-slate-500">{row.locationOrLink}</p> : null}
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-slate-700">{formatDateTime(row.scheduledAt)}</p>
          <p className="text-xs text-slate-500">{row.durationMinutes} minutes</p>
        </div>
      ),
    },
    {
      key: 'interviewer',
      header: 'Interviewer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-700">
            {fullName(row.interviewer) || row.interviewer.employeeCode || 'Interviewer'}
          </p>
          {row.interviewer.employeeCode ? <p className="text-xs text-slate-500">{row.interviewer.employeeCode}</p> : null}
        </div>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {row.recommendation ? (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              {row.rating}/5 · {RECOMMENDATION_LABELS[row.recommendation]}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  if (canManage || canFeedback) {
    columns.push({
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => {
        const openForFeedback =
          canFeedback && !row.feedbackAt && row.status !== 'CANCELLED' && row.status !== 'NO_SHOW';
        const reschedulable = canManage && row.status === 'SCHEDULED';

        return (
          <div className="flex items-center justify-end gap-1.5">
            {openForFeedback ? (
              <Button variant="ghost" size="sm" onClick={() => setFeedbackFor(row)} leftIcon={<Star className="h-4 w-4" />}>
                Feedback
              </Button>
            ) : null}
            {reschedulable ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScheduling({ interview: row })}
                  leftIcon={<Pencil className="h-4 w-4" />}
                >
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate(
                      { id: row.id, payload: { status: 'NO_SHOW' } },
                      {
                        onSuccess: () => toast.success('Marked as no-show'),
                        onError: (error) => toast.error(toMessage(error)),
                      },
                    )
                  }
                  leftIcon={<UserX className="h-4 w-4" />}
                >
                  No show
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCancelling(row)} leftIcon={<CalendarX className="h-4 w-4" />}>
                  Cancel
                </Button>
              </>
            ) : null}
          </div>
        );
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Every scheduled round, who is running it, and what they decided."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduling({ interview: null })}>
              Schedule interview
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <div className="w-64">
            <Input
              label="Search"
              placeholder="Candidate name or email"
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
              label="Status"
              placeholder="All statuses"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              options={INTERVIEW_STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={interviews.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={interviews.isPending}
          isFetching={interviews.isFetching}
          error={interviews.error}
          onRetry={() => void interviews.refetch()}
          emptyTitle="No interviews on the calendar"
          emptyDescription="Schedule a round for a candidate and it will show up here."
          emptyAction={
            canManage ? (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduling({ interview: null })}>
                Schedule interview
              </Button>
            ) : undefined
          }
        />
        <Pagination meta={interviews.data?.meta} onPageChange={setPage} />
      </Card>

      {scheduling ? (
        <ScheduleDialog
          interview={scheduling.interview}
          candidates={(candidates.data?.items ?? []).map((candidate) => ({
            value: candidate.id,
            label: `${candidate.firstName} ${candidate.lastName} · ${candidate.email}`,
          }))}
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee) || employee.email,
          }))}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setScheduling(null)}
          onSubmit={(payload) => {
            if (scheduling.interview) updateMutation.mutate({ id: scheduling.interview.id, payload });
            else createMutation.mutate(payload);
          }}
        />
      ) : null}

      {feedbackFor ? (
        <FeedbackDialog
          interview={feedbackFor}
          isSubmitting={feedbackMutation.isPending}
          onCancel={() => setFeedbackFor(null)}
          onSubmit={(payload) => feedbackMutation.mutate({ id: feedbackFor.id, payload })}
        />
      ) : null}

      {cancelling ? (
        <ConfirmDialog
          open
          title="Cancel interview?"
          message={`Round ${cancelling.round} with ${fullName(cancelling.interviewer)} for ${cancelling.candidate.firstName} ${cancelling.candidate.lastName} will be cancelled. The candidate stays in their current stage.`}
          confirmLabel="Cancel interview"
          isLoading={updateMutation.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={() => updateMutation.mutate({ id: cancelling.id, payload: { status: 'CANCELLED' } })}
        />
      ) : null}
    </>
  );
}

interface ScheduleDialogProps {
  interview: Interview | null;
  candidates: { value: string; label: string }[];
  employees: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: InterviewPayload) => void;
}

function ScheduleDialog({ interview, candidates, employees, isSubmitting, onCancel, onSubmit }: ScheduleDialogProps) {
  const [candidateId, setCandidateId] = useState(interview?.candidateId ?? '');
  const [interviewerId, setInterviewerId] = useState(interview?.interviewerId ?? '');
  const [round, setRound] = useState(String(interview?.round ?? 1));
  const [scheduledAt, setScheduledAt] = useState(interview ? toLocalInput(interview.scheduledAt) : '');
  const [durationMinutes, setDurationMinutes] = useState(String(interview?.durationMinutes ?? 60));
  const [mode, setMode] = useState<InterviewMode>(interview?.mode ?? 'VIDEO');
  const [locationOrLink, setLocationOrLink] = useState(interview?.locationOrLink ?? '');

  const valid = candidateId !== '' && interviewerId !== '' && scheduledAt !== '' && Number(round) >= 1;

  return (
    <Modal
      open
      title={interview ? 'Reschedule interview' : 'Schedule interview'}
      onClose={onCancel}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={!valid}
            onClick={() =>
              onSubmit({
                candidateId,
                interviewerId,
                round: Number(round),
                scheduledAt: new Date(scheduledAt).toISOString(),
                durationMinutes: Number(durationMinutes) || 60,
                mode,
                locationOrLink: locationOrLink.trim() || undefined,
              })
            }
          >
            {interview ? 'Save changes' : 'Schedule'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Candidate"
          name="candidateId"
          placeholder="Select a candidate"
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
          options={candidates}
          disabled={interview !== null}
        />
        <Select
          label="Interviewer"
          name="interviewerId"
          placeholder="Select an employee"
          value={interviewerId}
          onChange={(event) => setInterviewerId(event.target.value)}
          options={employees}
        />
        <Input
          label="Round"
          name="round"
          type="number"
          min={1}
          value={round}
          onChange={(event) => setRound(event.target.value)}
        />
        <Input
          label="Starts at"
          name="scheduledAt"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          hint="A new interview has to start in the future."
          required
        />
        <Input
          label="Duration (minutes)"
          name="durationMinutes"
          type="number"
          min={15}
          step={15}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
        />
        <Select
          label="Mode"
          name="mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as InterviewMode)}
          options={INTERVIEW_MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
        />
        <div className="sm:col-span-2">
          <Input
            label="Location or meeting link"
            name="locationOrLink"
            value={locationOrLink}
            onChange={(event) => setLocationOrLink(event.target.value)}
            placeholder="Conference room B, or the video call URL"
          />
        </div>
      </div>
    </Modal>
  );
}

interface FeedbackDialogProps {
  interview: Interview;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { rating: number; recommendation: InterviewRecommendation; feedback?: string; strengths?: string; improvements?: string }) => void;
}

function FeedbackDialog({ interview, isSubmitting, onCancel, onSubmit }: FeedbackDialogProps) {
  const [rating, setRating] = useState('3');
  const [recommendation, setRecommendation] = useState<InterviewRecommendation>('HIRE');
  const [feedback, setFeedback] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');

  return (
    <Modal
      open
      title={`Feedback · Round ${interview.round}`}
      description={`${interview.candidate.firstName} ${interview.candidate.lastName} · ${formatDateTime(interview.scheduledAt)}`}
      onClose={onCancel}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            onClick={() =>
              onSubmit({
                rating: Number(rating),
                recommendation,
                feedback: feedback.trim() || undefined,
                strengths: strengths.trim() || undefined,
                improvements: improvements.trim() || undefined,
              })
            }
          >
            Submit feedback
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Rating"
          name="rating"
          value={rating}
          onChange={(event) => setRating(event.target.value)}
          options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` }))}
        />
        <Select
          label="Recommendation"
          name="recommendation"
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value as InterviewRecommendation)}
          options={INTERVIEW_RECOMMENDATIONS.map((value) => ({ value, label: RECOMMENDATION_LABELS[value] }))}
        />
        <div className="sm:col-span-2">
          <Textarea
            label="Interview notes"
            name="feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="How the conversation went, what you probed, what landed."
          />
        </div>
        <Textarea
          label="Strengths"
          name="strengths"
          value={strengths}
          onChange={(event) => setStrengths(event.target.value)}
        />
        <Textarea
          label="Gaps / concerns"
          name="improvements"
          value={improvements}
          onChange={(event) => setImprovements(event.target.value)}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Submitting completes this round. A hiring recommendation moves the candidate forward; a no-hire only rejects them
        when this was their last scheduled round.
      </p>
    </Modal>
  );
}
