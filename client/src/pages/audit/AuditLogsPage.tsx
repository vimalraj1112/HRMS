import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { listAuditLogs, type AuditLogEntry } from '@/services/notification.service';

const ACTION_TONES: Record<string, 'success' | 'warning' | 'info' | 'danger' | undefined> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  APPROVE: 'success',
  REJECT: 'warning',
  CORRECTION: 'warning',
  LOCK: 'warning',
  PROCESS: 'info',
  STATUS_CHANGE: 'info',
};

function actionTone(action: string): 'success' | 'warning' | 'info' | 'danger' | undefined {
  const suffix = action.split('_').at(-1) ?? '';
  return ACTION_TONES[suffix];
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <pre className="scrollbar-thin max-h-56 overflow-auto rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const logs = useQuery({
    queryKey: ['audit-logs', { page, action, entity, userEmail, from, to }],
    queryFn: () =>
      listAuditLogs({
        page,
        limit: 25,
        action: action || undefined,
        entity: entity || undefined,
        userEmail: userEmail || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const activeFilterCount = [action, entity, userEmail, from, to].filter(Boolean).length;
  const facets = logs.data?.facets ?? { actions: [], entities: [] };

  const resetFilters = () => {
    setAction('');
    setEntity('');
    setUserEmail('');
    setEmailDraft('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-slate-600">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{row.userEmail ?? 'system'}</p>
          {row.ipAddress ? <p className="truncate text-xs text-slate-400">{row.ipAddress}</p> : null}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={actionTone(row.action)}>{row.action.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{row.entity}</p>
          {row.entityId ? <p className="truncate font-mono text-xs text-slate-400">{row.entityId}</p> : null}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setDetail(row)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Every create, update, approval and sign-in event recorded across the system."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Action"
              value={action}
              onChange={(event) => {
                setPage(1);
                setAction(event.target.value);
              }}
              options={[
                { value: '', label: 'All actions' },
                ...facets.actions.map((facet) => ({ value: facet.value, label: `${facet.value.replace(/_/g, ' ')} (${facet.count})` })),
              ]}
            />
            <Select
              label="Entity"
              value={entity}
              onChange={(event) => {
                setPage(1);
                setEntity(event.target.value);
              }}
              options={[
                { value: '', label: 'All entities' },
                ...facets.entities.map((facet) => ({ value: facet.value, label: `${facet.value} (${facet.count})` })),
              ]}
            />
            <Input
              label="Actor email"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setUserEmail(emailDraft.trim());
                }
              }}
              placeholder="hradmin@superlink.local"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="From"
                type="date"
                value={from}
                onChange={(event) => {
                  setPage(1);
                  setFrom(event.target.value);
                }}
              />
              <Input
                label="To"
                type="date"
                value={to}
                onChange={(event) => {
                  setPage(1);
                  setTo(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Filter className="h-4 w-4" />}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Button
              onClick={() => {
                setPage(1);
                setUserEmail(emailDraft.trim());
              }}
            >
              Apply
            </Button>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={resetFilters}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Use the filters above to narrow the trail by action, entity, actor or date. Entries are ordered newest
            first and cannot be edited or deleted.
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={logs.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={logs.isPending}
          isFetching={logs.isFetching}
          error={logs.error}
          onRetry={() => void logs.refetch()}
          emptyTitle="No audit entries found"
          emptyDescription="Nothing matches these filters yet."
          emptyAction={
            activeFilterCount > 0 ? (
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null
          }
          footer={<Pagination meta={logs.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {detail !== null ? (
        <Modal open title={`${detail.entity} · ${detail.action.replace(/_/g, ' ')}`} onClose={() => setDetail(null)} size="lg">
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Actor</dt>
                <dd className="truncate text-slate-800">{detail.userEmail ?? 'system'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">When</dt>
                <dd className="text-slate-800">{new Date(detail.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">IP address</dt>
                <dd className="text-slate-800">{detail.ipAddress ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Request ID</dt>
                <dd className="truncate font-mono text-xs text-slate-800">{detail.requestId ?? '—'}</dd>
              </div>
            </dl>

            <div className="flex gap-3">
              <JsonBlock label="Before" value={detail.oldValue} />
              <JsonBlock label="After" value={detail.newValue} />
            </div>

            {detail.userAgent ? (
              <p className="break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{detail.userAgent}</p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}