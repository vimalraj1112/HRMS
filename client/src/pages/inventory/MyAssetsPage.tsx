import { useQuery } from '@tanstack/react-query';
import { History, Package } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate } from '@/lib/utils';
import { listAssets, listMyAssetHistory } from '@/services/asset.service';
import { useAuthStore } from '@/stores/auth.store';
import { assetCategoryLabel, type Asset, type AssetAssignment } from '@/types/asset';

const HISTORY_LIMIT = 20;

export function MyAssetsPage() {
  const [historyPage, setHistoryPage] = useState(1);
  const myEmployeeId = useAuthStore((state) => state.user?.employee?.id);

  // Admins can read every asset, so the filter pins this view to their own record.
  const assets = useQuery({
    queryKey: ['assets', 'list', 'mine', myEmployeeId],
    enabled: Boolean(myEmployeeId),
    queryFn: () =>
      listAssets({
        page: 1,
        limit: HISTORY_LIMIT,
        assignedEmployeeId: myEmployeeId,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  const history = useQuery({
    queryKey: ['assets', 'my-history', historyPage],
    queryFn: () => listMyAssetHistory({ page: historyPage, limit: HISTORY_LIMIT }),
  });

  const assetColumns: Column<Asset>[] = [
    {
      key: 'asset',
      header: 'Asset',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Package className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.name}</p>
            <p className="truncate text-xs text-slate-500">
              {row.assetTag}
              {row.serialNumber ? ` · ${row.serialNumber}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-slate-700">{assetCategoryLabel(row.category)}</span>,
    },
    { key: 'assignedAt', header: 'Assigned on', render: (row) => <span className="text-slate-700">{formatDate(row.assignedAt)}</span> },
    {
      key: 'warranty',
      header: 'Warranty',
      render: (row) => <span className="text-slate-700">{formatDate(row.warrantyExpiry)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  const historyColumns: Column<AssetAssignment>[] = [
    {
      key: 'asset',
      header: 'Asset',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.asset.name}</p>
          <p className="truncate text-xs text-slate-500">{row.asset.assetTag}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-slate-700">{assetCategoryLabel(row.asset.category)}</span>,
    },
    { key: 'assignedAt', header: 'Issued', render: (row) => <span className="text-slate-700">{formatDate(row.assignedAt)}</span> },
    {
      key: 'returnedAt',
      header: 'Returned',
      render: (row) => <span className="text-slate-700">{row.returnedAt ? formatDate(row.returnedAt) : 'Still with me'}</span>,
    },
    {
      key: 'issuedBy',
      header: 'Issued by',
      render: (row) => <span className="text-slate-700">{row.assignedBy?.email ?? '-'}</span>,
    },
    {
      key: 'state',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) =>
        row.returnedAt ? <Badge tone="neutral">Returned</Badge> : <Badge tone="success">In use</Badge>,
    },
  ];

  const currentCount = assets.data?.meta.total ?? 0;

  return (
    <>
      <PageHeader
        title="My Assets"
        description="Company equipment issued to you and your complete hand-over history."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Currently held</p>
            <p className="text-xl font-semibold text-slate-900">{currentCount}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <History className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total assignments</p>
            <p className="text-xl font-semibold text-slate-900">{history.data?.meta.total ?? 0}</p>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Assets in your possession</h2>
            <p className="mt-0.5 text-sm text-slate-500">Items currently checked out to you.</p>
          </div>
          <DataTable
            columns={assetColumns}
            rows={assets.data?.items ?? []}
            rowKey={(row) => row.id}
            isLoading={assets.isPending}
            isFetching={assets.isFetching}
            error={assets.error}
            onRetry={() => void assets.refetch()}
            emptyTitle="No assets assigned"
            emptyDescription="Equipment issued to you will appear here."
          />
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Assignment history</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Every asset that has passed through your hands.
            </p>
          </div>
          <DataTable
            columns={historyColumns}
            rows={history.data?.items ?? []}
            rowKey={(row) => row.id}
            isLoading={history.isPending}
            isFetching={history.isFetching}
            error={history.error}
            onRetry={() => void history.refetch()}
            emptyTitle="No history yet"
            emptyDescription="Assignments and returns are recorded here."
            footer={<Pagination meta={history.data?.meta} onPageChange={setHistoryPage} />}
          />
        </Card>
      </div>
    </>
  );
}
