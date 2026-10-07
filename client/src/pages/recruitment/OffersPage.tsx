import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Search, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listCandidates, listOffers, respondToOffer, createOffer, updateOffer } from '@/services/recruitment.service';
import {
  OFFER_STATUSES,
  type Offer,
  type OfferPayload,
  type OfferStatus,
  type OfferUpdatePayload,
} from '@/types/recruitment';
import { canManageOffers } from './access';

const statusLabel = (status: OfferStatus) => status.replace(/_/g, ' ');

/** Offer lifecycle colours the shared status badge does not cover. */
const OFFER_TONE: Record<OfferStatus, BadgeProps['tone']> = {
  DRAFT: 'neutral',
  EXTENDED: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  EXPIRED: 'warning',
};

function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <Badge tone={OFFER_TONE[status]}>{statusLabel(status)}</Badge>;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OffersPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const canManage = canManageOffers(role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [extending, setExtending] = useState<Offer | null>(null);
  const [responding, setResponding] = useState<Offer | null>(null);
  const [withdrawing, setWithdrawing] = useState<Offer | null>(null);
  const [expiring, setExpiring] = useState<Offer | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'offers'] });
    void queryClient.invalidateQueries({ queryKey: ['recruitment', 'candidates'] });
  };

  const offers = useQuery({
    queryKey: ['recruitment', 'offers', 'list', { page, search, status }],
    queryFn: () =>
      listOffers({
        page,
        limit: 20,
        search: search || undefined,
        status: (status || undefined) as OfferStatus | undefined,
      }),
  });

  const candidates = useQuery({
    queryKey: ['recruitment', 'candidates', 'picker'],
    enabled: creating,
    queryFn: () => listCandidates({ limit: 100, sortOrder: 'desc' }),
  });

  const createMutation = useMutation({
    mutationFn: createOffer,
    onSuccess: (offer) => {
      toast.success(`Offer created for ${offer.candidate.firstName} ${offer.candidate.lastName}`);
      setCreating(false);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: OfferUpdatePayload }) => updateOffer(input.id, input.payload),
    onSuccess: (offer) => {
      toast.success(
        offer.status === 'EXTENDED'
          ? 'Offer extended'
          : offer.status === 'EXPIRED'
            ? 'Offer marked as expired'
            : offer.status === 'WITHDRAWN'
              ? 'Offer withdrawn'
              : 'Offer updated',
      );
      setEditing(null);
      setExtending(null);
      setWithdrawing(null);
      setExpiring(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const respondMutation = useMutation({
    mutationFn: (input: { id: string; status: 'ACCEPTED' | 'REJECTED'; notes?: string }) =>
      respondToOffer(input.id, input.status, input.notes),
    onSuccess: (offer) => {
      toast.success(
        offer.status === 'ACCEPTED'
          ? `Accepted — ${fullName(offer.candidate)} is hired`
          : `Rejected — ${fullName(offer.candidate)} is back in the pipeline`,
      );
      setResponding(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const columns: Column<Offer>[] = [
    {
      key: 'candidate',
      header: 'Candidate',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {row.candidate.firstName} {row.candidate.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">
            {row.jobOpening?.title ?? row.candidate.jobOpening?.title ?? 'General application'} · {row.candidate.email}
          </p>
        </div>
      ),
    },
    {
      key: 'ctc',
      header: 'Annual CTC',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{formatCurrency(row.annualCtc)}</p>
          <p className="text-xs text-slate-500">
            Joining {row.joiningDate ? formatDate(row.joiningDate) : 'not set'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const expiredSoon = row.status === 'EXTENDED' && row.expiresAt !== null && new Date(row.expiresAt) < new Date();
        return (
          <div className="flex flex-col gap-1">
            <OfferStatusBadge status={row.status} />
            {row.expiresAt ? (
              <span className={expiredSoon ? 'text-xs font-medium text-rose-600' : 'text-xs text-slate-500'}>
                {expiredSoon ? 'Past expiry ' : 'Expires '}
                {formatDateTime(row.expiresAt)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'timeline',
      header: 'Timeline',
      render: (row) => (
        <div className="text-xs text-slate-500">
          <p>Created {formatDate(row.createdAt)}</p>
          {row.issuedAt ? <p>Issued {formatDateTime(row.issuedAt)}</p> : null}
          {row.respondedAt ? <p>Responded {formatDateTime(row.respondedAt)}</p> : null}
        </div>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => {
        const pastExpiry = row.expiresAt !== null && new Date(row.expiresAt).getTime() <= Date.now();

        if (row.status === 'DRAFT') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setExtending(row)} leftIcon={<Send className="h-4 w-4" />}>
                Extend
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(row)} leftIcon={<Pencil className="h-4 w-4" />}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWithdrawing(row)} leftIcon={<XCircle className="h-4 w-4" />}>
                Withdraw
              </Button>
            </div>
          );
        }

        if (row.status === 'EXTENDED') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setResponding(row)} leftIcon={<Send className="h-4 w-4" />}>
                Respond
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpiring(row)}
                disabled={!pastExpiry}
                title={pastExpiry ? undefined : 'Only offers past their expiry date can expire'}
                leftIcon={<CalendarClock className="h-4 w-4" />}
              >
                Expire
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(row)} leftIcon={<Pencil className="h-4 w-4" />}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWithdrawing(row)} leftIcon={<XCircle className="h-4 w-4" />}>
                Withdraw
              </Button>
            </div>
          );
        }

        return <span className="text-xs text-slate-400">Closed</span>;
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Offers"
        description="Draft, extend and track offers until they are accepted or closed."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New offer
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
              options={OFFER_STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={offers.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={offers.isPending}
          isFetching={offers.isFetching}
          error={offers.error}
          onRetry={() => void offers.refetch()}
          emptyTitle="No offers yet"
          emptyDescription="Create an offer for a candidate who made it through interviews."
          emptyAction={
            canManage ? (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                New offer
              </Button>
            ) : undefined
          }
        />
        <Pagination meta={offers.data?.meta} onPageChange={setPage} />
      </Card>

      {creating || editing ? (
        <OfferFormDialog
          offer={editing}
          candidates={(candidates.data?.items ?? []).map((candidate) => ({
            value: candidate.id,
            label: `${candidate.firstName} ${candidate.lastName} · ${candidate.email}`,
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

      {extending ? (
        <ExtendOfferDialog
          offer={extending}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setExtending(null)}
          onSubmit={(payload) => updateMutation.mutate({ id: extending.id, payload })}
        />
      ) : null}

      {responding ? (
        <RespondOfferDialog
          offer={responding}
          isSubmitting={respondMutation.isPending}
          onCancel={() => setResponding(null)}
          onSubmit={({ status: decision, notes }) =>
            respondMutation.mutate({ id: responding.id, status: decision, notes })
          }
        />
      ) : null}

      {withdrawing ? (
        <ConfirmDialog
          open
          tone="danger"
          title="Withdraw offer?"
          message={`The offer of ${formatCurrency(withdrawing.annualCtc)} to ${withdrawing.candidate.firstName} ${withdrawing.candidate.lastName} will be closed. This cannot be undone.`}
          confirmLabel="Withdraw offer"
          isLoading={updateMutation.isPending}
          onCancel={() => setWithdrawing(null)}
          onConfirm={() => updateMutation.mutate({ id: withdrawing.id, payload: { status: 'WITHDRAWN' } })}
        />
      ) : null}

      {expiring ? (
        <ConfirmDialog
          open
          tone="primary"
          title="Mark as expired?"
          message={`The offer to ${expiring.candidate.firstName} ${expiring.candidate.lastName} passed its expiry date. Marking it expired closes the offer.`}
          confirmLabel="Mark expired"
          isLoading={updateMutation.isPending}
          onCancel={() => setExpiring(null)}
          onConfirm={() => updateMutation.mutate({ id: expiring.id, payload: { status: 'EXPIRED' } })}
        />
      ) : null}
    </>
  );
}

interface OfferFormDialogProps {
  offer: Offer | null;
  candidates: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: OfferPayload) => void;
}

function OfferFormDialog({ offer, candidates, isSubmitting, onCancel, onSubmit }: OfferFormDialogProps) {
  const [candidateId, setCandidateId] = useState(offer?.candidateId ?? '');
  const [annualCtc, setAnnualCtc] = useState(String(offer?.annualCtc ?? ''));
  const [joiningDate, setJoiningDate] = useState(offer?.joiningDate ?? '');
  const [expiresAt, setExpiresAt] = useState(() => (offer?.expiresAt ? toLocalInput(offer.expiresAt) : ''));
  const [notes, setNotes] = useState(offer?.notes ?? '');
  const [initialStatus, setInitialStatus] = useState<OfferStatus>('DRAFT');

  const needsExpiry = offer === null && initialStatus === 'EXTENDED';
  const valid =
    (offer !== null || candidateId !== '') && annualCtc !== '' && Number(annualCtc) > 0 && (!needsExpiry || expiresAt !== '');

  return (
    <Modal
      open
      title={offer ? 'Edit offer' : 'New offer'}
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
                candidateId: offer ? offer.candidateId : candidateId,
                annualCtc: Number(annualCtc),
                joiningDate: joiningDate || undefined,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                notes: notes.trim() || undefined,
                ...(offer ? {} : { status: initialStatus }),
              })
            }
          >
            {offer ? 'Save changes' : 'Create offer'}
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
          disabled={offer !== null}
        />
        <Input
          label="Annual CTC (₹)"
          name="annualCtc"
          type="number"
          min={0}
          value={annualCtc}
          onChange={(event) => setAnnualCtc(event.target.value)}
          required
        />
        <Input
          label="Joining date"
          name="joiningDate"
          type="date"
          value={joiningDate}
          onChange={(event) => setJoiningDate(event.target.value)}
        />
        <Input
          label="Offer expires at"
          name="expiresAt"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          hint="Required as soon as the offer is extended."
          error={needsExpiry && expiresAt === '' ? 'An expiry date is required to extend an offer.' : undefined}
        />
        {offer === null ? (
          <Select
            label="Start as"
            name="status"
            value={initialStatus}
            onChange={(event) => setInitialStatus(event.target.value as OfferStatus)}
            options={[
              { value: 'DRAFT', label: 'Draft (review first)' },
              { value: 'EXTENDED', label: 'Extended (send now)' },
            ]}
          />
        ) : null}
        <div className={offer === null ? '' : 'sm:col-span-2'}>
          <Textarea label="Notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

interface ExtendOfferDialogProps {
  offer: Offer;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: OfferUpdatePayload) => void;
}

function ExtendOfferDialog({ offer, isSubmitting, onCancel, onSubmit }: ExtendOfferDialogProps) {
  const [expiresAt, setExpiresAt] = useState(() => (offer.expiresAt ? toLocalInput(offer.expiresAt) : ''));

  return (
    <Modal
      open
      title="Extend offer"
      description={`${offer.candidate.firstName} ${offer.candidate.lastName} · ${formatCurrency(offer.annualCtc)} a year`}
      onClose={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={expiresAt === ''}
            onClick={() => onSubmit({ status: 'EXTENDED', expiresAt: new Date(expiresAt).toISOString() })}
          >
            Extend offer
          </Button>
        </div>
      }
    >
      <Input
        label="Offer expires at"
        name="expiresAt"
        type="datetime-local"
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
        hint="Extending moves the candidate to the offered stage and notifies the owner."
        error={expiresAt === '' ? 'An expiry date is required to extend this offer.' : undefined}
        required
      />
    </Modal>
  );
}

interface RespondOfferDialogProps {
  offer: Offer;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { status: 'ACCEPTED' | 'REJECTED'; notes?: string }) => void;
}

function RespondOfferDialog({ offer, isSubmitting, onCancel, onSubmit }: RespondOfferDialogProps) {
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open
      title="Record response"
      description={`${offer.candidate.firstName} ${offer.candidate.lastName} · ${formatCurrency(offer.annualCtc)} a year`}
      onClose={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant={decision === 'ACCEPTED' ? 'primary' : 'danger'}
            isLoading={isSubmitting}
            onClick={() => onSubmit({ status: decision, notes: notes.trim() || undefined })}
          >
            {decision === 'ACCEPTED' ? 'Accept offer' : 'Reject offer'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Candidate decision"
          name="decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value as 'ACCEPTED' | 'REJECTED')}
          options={[
            { value: 'ACCEPTED', label: 'Accepted — hiring them' },
            { value: 'REJECTED', label: 'Rejected — walking away' },
          ]}
        />
        <Textarea label="Notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <p className="text-xs text-slate-500">
          Accepting marks the candidate as hired. Rejecting only sends them back a stage when this offer was the one on
          the table.
        </p>
      </div>
    </Modal>
  );
}
