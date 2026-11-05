import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { formatCurrency, formatDate, fullName } from '@/lib/utils';
import { listEmployees } from '@/services/employee.service';
import {
  assignAsset,
  createAsset,
  deleteAsset,
  getAssetHistory,
  getAssetStats,
  listAssets,
  returnAsset,
  updateAsset,
} from '@/services/asset.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  EDITABLE_ASSET_STATUSES,
  assetCategoryLabel,
  type Asset,
  type AssetAssignment,
  type AssetCategory,
  type AssetPayload,
  type AssetStatus,
  type EditableAssetStatus,
} from '@/types/asset';

const CATEGORY_OPTIONS = ASSET_CATEGORIES.map((entry) => ({ value: entry.value, label: entry.label }));
const STATUS_OPTIONS = ASSET_STATUSES.map((entry) => ({ value: entry.value, label: entry.label }));
const EDITABLE_STATUS_OPTIONS = EDITABLE_ASSET_STATUSES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

const assetSchema = z.object({
  assetTag: z.string().trim().min(1, 'Asset tag is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(160),
  category: z.enum(ASSET_CATEGORIES.map((entry) => entry.value) as [AssetCategory, ...AssetCategory[]]),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  status: z.enum(EDITABLE_ASSET_STATUSES.map((entry) => entry.value) as [
    EditableAssetStatus,
    ...EditableAssetStatus[],
  ]),
  purchaseDate: z.string().optional(),
  purchaseCost: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (Number.isFinite(Number(value)) && Number(value) >= 0), 'Enter a valid amount'),
  vendor: z.string().trim().max(160).optional(),
  warrantyExpiry: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

const EMPTY_ASSET: AssetFormValues = {
  assetTag: '',
  name: '',
  category: 'LAPTOP',
  brand: '',
  model: '',
  serialNumber: '',
  status: 'AVAILABLE',
  purchaseDate: '',
  purchaseCost: '',
  vendor: '',
  warrantyExpiry: '',
  notes: '',
};

function toPayload(values: AssetFormValues): AssetPayload {
  return {
    assetTag: values.assetTag.trim(),
    name: values.name.trim(),
    category: values.category,
    status: values.status,
    ...(values.brand?.trim() ? { brand: values.brand.trim() } : {}),
    ...(values.model?.trim() ? { model: values.model.trim() } : {}),
    ...(values.serialNumber?.trim() ? { serialNumber: values.serialNumber.trim() } : {}),
    ...(values.purchaseDate ? { purchaseDate: values.purchaseDate } : {}),
    ...(values.purchaseCost?.trim() ? { purchaseCost: Number(values.purchaseCost) } : {}),
    ...(values.vendor?.trim() ? { vendor: values.vendor.trim() } : {}),
    ...(values.warrantyExpiry ? { warrantyExpiry: values.warrantyExpiry } : {}),
    ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
  };
}

function warrantyTone(asset: Asset): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!asset.warrantyExpiry) return 'neutral';
  const daysLeft = Math.floor((new Date(`${asset.warrantyExpiry}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return 'danger';
  if (daysLeft <= 30) return 'warning';
  return 'success';
}

export function InventoryPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();

  const canReadAny = can(role, 'asset:read:any');
  const canManage = can(role, 'asset:manage');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [category, setCategory] = useState<AssetCategory | ''>('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [employeeId, setEmployeeId] = useState('');
  const [warranty, setWarranty] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [assigning, setAssigning] = useState<Asset | null>(null);
  const [returning, setReturning] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [viewing, setViewing] = useState<Asset | null>(null);

  const assets = useQuery({
    queryKey: ['assets', 'list', { page, search, category, status, employeeId, warranty }],
    queryFn: () =>
      listAssets({
        page,
        limit: 20,
        search: search || undefined,
        category: category || undefined,
        status: status || undefined,
        assignedEmployeeId: canReadAny && employeeId ? employeeId : undefined,
        warrantyExpiringWithinDays: warranty ? Number(warranty) : undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  const stats = useQuery({
    queryKey: ['assets', 'stats'],
    queryFn: getAssetStats,
  });

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    enabled: canReadAny,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const employeeOptions = useMemo(
    () =>
      (employees.data?.items ?? []).map((employee) => ({
        value: employee.id,
        label: `${fullName(employee)} (${employee.employeeCode})`,
      })),
    [employees.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
  };

  const save = useMutation({
    mutationFn: (values: AssetFormValues) =>
      editing ? updateAsset(editing.id, toPayload(values)) : createAsset(toPayload(values)),
    onSuccess: () => {
      toast.success(editing ? 'Asset updated' : 'Asset added');
      setCreating(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => {
      toast.success('Asset removed');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => {
      setDeleting(null);
      toast.error(toMessage(error));
    },
  });

  const assign = useMutation({
    mutationFn: (input: { id: string; payload: Parameters<typeof assignAsset>[1] }) =>
      assignAsset(input.id, input.payload),
    onSuccess: (asset) => {
      toast.success(`${asset.name} assigned`);
      setAssigning(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const giveBack = useMutation({
    mutationFn: (input: { id: string; payload: Parameters<typeof returnAsset>[1] }) =>
      returnAsset(input.id, input.payload),
    onSuccess: (asset) => {
      toast.success(`${asset.name} returned`);
      setReturning(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const columns = useMemo<Column<Asset>[]>(() => {
    const base: Column<Asset>[] = [
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
      {
        key: 'assignedTo',
        header: 'Assigned to',
        render: (row) =>
          row.assignedEmployee ? (
            <div className="min-w-0">
              <p className="truncate text-slate-700">{fullName(row.assignedEmployee)}</p>
              <p className="truncate text-xs text-slate-500">{row.assignedEmployee.employeeCode}</p>
            </div>
          ) : (
            <span className="text-slate-400">Unassigned</span>
          ),
      },
      { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'warranty',
        header: 'Warranty',
        render: (row) => (
          <Badge tone={warrantyTone(row)}>
            {row.warrantyExpiry ? formatDate(row.warrantyExpiry) : 'No warranty'}
          </Badge>
        ),
      },
      {
        key: 'value',
        header: 'Cost',
        render: (row) => (
          <span className="text-slate-700">{row.purchaseCost === null ? '-' : formatCurrency(row.purchaseCost)}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        headerClassName: 'text-right',
        className: 'text-right',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" title="View history" onClick={() => setViewing(row)}>
              <History className="h-4 w-4" />
            </Button>
            {canManage ? (
              <>
                {row.assignedEmployeeId ? (
                  <Button variant="ghost" size="icon" title="Return asset" onClick={() => setReturning(row)}>
                    <Undo2 className="h-4 w-4 text-amber-600" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Assign asset"
                    disabled={row.status === 'RETIRED' || row.status === 'LOST'}
                    onClick={() => setAssigning(row)}
                  >
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" title="Edit asset" onClick={() => setEditing(row)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete asset" onClick={() => setDeleting(row)}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ];

    return canReadAny ? base : base.filter((column) => column.key !== 'assignedTo');
  }, [canManage, canReadAny]);

  const summary = stats.data;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Company IT assets, who holds them and their full hand-over history."
        actions={
          canManage ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setCreating(true);
                save.reset();
              }}
            >
              Add asset
            </Button>
          ) : null
        }
      />

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total assets" value={summary.total} />
          <StatCard label="Assigned" value={summary.assigned} tone="text-brand-700" />
          <StatCard label="Available" value={summary.available} tone="text-emerald-700" />
          <StatCard label="In repair" value={summary.inRepair} tone="text-amber-700" />
          <StatCard label="Warranty < 30d" value={summary.warrantyExpiring} tone="text-rose-700" />
          <StatCard label="Asset value" value={formatCurrency(summary.totalValue)} />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
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
              placeholder="Search by tag, name, serial, brand or model"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select
              value={category}
              onChange={(event) => {
                setPage(1);
                setCategory(event.target.value as AssetCategory | '');
              }}
              options={CATEGORY_OPTIONS}
              placeholder="All categories"
              aria-label="Category"
            />
            <Select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as AssetStatus | '');
              }}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              aria-label="Status"
            />
            {canReadAny ? (
              <Select
                value={employeeId}
                onChange={(event) => {
                  setPage(1);
                  setEmployeeId(event.target.value);
                }}
                options={employeeOptions}
                placeholder="Any employee"
                aria-label="Assigned employee"
              />
            ) : null}
            <Select
              value={warranty}
              onChange={(event) => {
                setPage(1);
                setWarranty(event.target.value);
              }}
              options={[
                { value: '30', label: 'Warranty < 30 days' },
                { value: '90', label: 'Warranty < 90 days' },
                { value: '365', label: 'Warranty < 1 year' },
              ]}
              placeholder="Any warranty"
              aria-label="Warranty"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={assets.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={assets.isPending}
          isFetching={assets.isFetching}
          error={assets.error}
          onRetry={() => void assets.refetch()}
          emptyTitle="No assets found"
          emptyDescription="Add your first asset or adjust the filters."
          emptyAction={
            canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                Add asset
              </Button>
            ) : null
          }
          footer={<Pagination meta={assets.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {creating || editing ? (
        <AssetDialog
          key={editing?.id ?? 'new'}
          asset={editing}
          isSubmitting={save.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      ) : null}

      {assigning ? (
        <AssignDialog
          asset={assigning}
          employees={employeeOptions}
          isSubmitting={assign.isPending}
          onClose={() => setAssigning(null)}
          onSubmit={(payload) => assign.mutate({ id: assigning.id, payload })}
        />
      ) : null}

      {returning ? (
        <ReturnDialog
          asset={returning}
          isSubmitting={giveBack.isPending}
          onClose={() => setReturning(null)}
          onSubmit={(payload) => giveBack.mutate({ id: returning.id, payload })}
        />
      ) : null}

      {viewing ? <AssetDetailDialog asset={viewing} onClose={() => setViewing(null)} /> : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete asset"
        message={
          deleting
            ? `${deleting.name} (${deleting.assetTag}) will be removed from the register. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        isLoading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
    </Card>
  );
}

function AssetDialog({
  asset,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  asset: Asset | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: AssetFormValues) => void;
}) {
  const [values, setValues] = useState<AssetFormValues>(() =>
    asset
      ? {
          assetTag: asset.assetTag,
          name: asset.name,
          category: asset.category,
          brand: asset.brand ?? '',
          model: asset.model ?? '',
          serialNumber: asset.serialNumber ?? '',
          status: asset.status === 'ASSIGNED' ? 'AVAILABLE' : asset.status,
          purchaseDate: asset.purchaseDate ?? '',
          purchaseCost: asset.purchaseCost === null ? '' : String(asset.purchaseCost),
          vendor: asset.vendor ?? '',
          warrantyExpiry: asset.warrantyExpiry ?? '',
          notes: asset.notes ?? '',
        }
      : EMPTY_ASSET,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const result = assetSchema.safeParse(values);
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
      title={asset ? `Edit ${asset.name}` : 'Add asset'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            {asset ? 'Save changes' : 'Add asset'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Asset tag"
            value={values.assetTag}
            error={errors.assetTag}
            placeholder="e.g. SL-LAP-014"
            onChange={(event) => setValues({ ...values, assetTag: event.target.value })}
          />
          <Input
            label="Name"
            value={values.name}
            error={errors.name}
            placeholder="e.g. Dell Latitude 5440"
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            value={values.category}
            error={errors.category}
            options={CATEGORY_OPTIONS}
            onChange={(event) => setValues({ ...values, category: event.target.value as AssetCategory })}
          />
          <Select
            label="Status"
            value={values.status}
            error={errors.status}
            options={EDITABLE_STATUS_OPTIONS}
            disabled={Boolean(asset?.assignedEmployeeId)}
            hint={asset?.assignedEmployeeId ? 'Return the asset before changing its status.' : undefined}
            onChange={(event) => setValues({ ...values, status: event.target.value as EditableAssetStatus })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Brand"
            value={values.brand}
            onChange={(event) => setValues({ ...values, brand: event.target.value })}
          />
          <Input
            label="Model"
            value={values.model}
            onChange={(event) => setValues({ ...values, model: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Serial number"
            value={values.serialNumber}
            error={errors.serialNumber}
            onChange={(event) => setValues({ ...values, serialNumber: event.target.value })}
          />
          <Input
            label="Vendor"
            value={values.vendor}
            onChange={(event) => setValues({ ...values, vendor: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Purchase date"
            type="date"
            value={values.purchaseDate}
            onChange={(event) => setValues({ ...values, purchaseDate: event.target.value })}
          />
          <Input
            label="Purchase cost"
            type="number"
            min="0"
            step="0.01"
            value={values.purchaseCost}
            error={errors.purchaseCost}
            onChange={(event) => setValues({ ...values, purchaseCost: event.target.value })}
          />
          <Input
            label="Warranty expiry"
            type="date"
            value={values.warrantyExpiry}
            onChange={(event) => setValues({ ...values, warrantyExpiry: event.target.value })}
          />
        </div>
        <Textarea
          label="Notes"
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </div>
    </Modal>
  );
}

function AssignDialog({
  asset,
  employees,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  asset: Asset;
  employees: { value: string; label: string }[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    employeeId: string;
    expectedReturnAt?: string;
    issueCondition?: string;
    notes?: string;
  }) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [issueCondition, setIssueCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!employeeId) {
      setError('Select an employee');
      return;
    }
    onSubmit({
      employeeId,
      ...(expectedReturnAt ? { expectedReturnAt } : {}),
      ...(issueCondition.trim() ? { issueCondition: issueCondition.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  return (
    <Modal
      open
      title={`Assign ${asset.name}`}
      description={`${asset.assetTag} will move to the selected employee.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit} leftIcon={<UserPlus className="h-4 w-4" />}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Employee"
          value={employeeId}
          error={error}
          placeholder="Select employee"
          options={employees}
          onChange={(event) => {
            setEmployeeId(event.target.value);
            setError('');
          }}
        />
        <Input
          label="Expected return date"
          type="date"
          hint="Optional — leave blank for a permanent allocation."
          value={expectedReturnAt}
          onChange={(event) => setExpectedReturnAt(event.target.value)}
        />
        <Input
          label="Condition on issue"
          placeholder="e.g. New, Good, Minor scratches"
          value={issueCondition}
          onChange={(event) => setIssueCondition(event.target.value)}
        />
        <Textarea
          label="Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function ReturnDialog({
  asset,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  asset: Asset;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { returnCondition?: string; notes?: string; status: EditableAssetStatus }) => void;
}) {
  const [returnCondition, setReturnCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<EditableAssetStatus>('AVAILABLE');

  return (
    <Modal
      open
      title={`Return ${asset.name}`}
      description={
        asset.assignedEmployee
          ? `Currently held by ${fullName(asset.assignedEmployee)} (${asset.assignedEmployee.employeeCode}).`
          : 'Mark this asset as returned.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={() => onSubmit({ returnCondition: returnCondition || undefined, notes: notes || undefined, status })}>
            Confirm return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Condition on return"
          value={status}
          options={EDITABLE_STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value as EditableAssetStatus)}
          hint="Choose where the asset goes after it comes back."
        />
        <Input
          label="Reported condition"
          placeholder="e.g. Good, Screen cracked"
          value={returnCondition}
          onChange={(event) => setReturnCondition(event.target.value)}
        />
        <Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        {status === 'LOST' || status === 'RETIRED' ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            The asset will leave the active pool after this return.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function AssetDetailDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['assets', 'history', asset.id],
    queryFn: () => getAssetHistory(asset.id),
  });

  return (
    <Modal open title={`${asset.name} · ${asset.assetTag}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Detail label="Category" value={assetCategoryLabel(asset.category)} />
          <Detail label="Status" value={<StatusBadge status={asset.status} />} />
          <Detail label="Serial number" value={asset.serialNumber ?? '-'} />
          <Detail label="Brand" value={asset.brand ?? '-'} />
          <Detail label="Model" value={asset.model ?? '-'} />
          <Detail label="Vendor" value={asset.vendor ?? '-'} />
          <Detail label="Purchase date" value={formatDate(asset.purchaseDate)} />
          <Detail label="Purchase cost" value={asset.purchaseCost === null ? '-' : formatCurrency(asset.purchaseCost)} />
          <Detail label="Warranty expiry" value={formatDate(asset.warrantyExpiry)} />
          <Detail
            label="Assigned to"
            value={
              asset.assignedEmployee
                ? `${fullName(asset.assignedEmployee)} (${asset.assignedEmployee.employeeCode})`
                : 'Unassigned'
            }
          />
          <Detail label="Assigned on" value={formatDate(asset.assignedAt)} />
        </div>

        {asset.notes ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
            <p className="mt-1 text-sm text-slate-700">{asset.notes}</p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Hand-over history</p>
          {history.isPending ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : history.data && history.data.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {history.data.map((entry: AssetAssignment) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {fullName(entry.employee)} <span className="text-xs text-slate-500">({entry.employee.employeeCode})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(entry.assignedAt)} → {entry.returnedAt ? formatDate(entry.returnedAt) : 'Present'}
                      {entry.issueCondition ? ` · Issued: ${entry.issueCondition}` : ''}
                      {entry.returnCondition ? ` · Returned: ${entry.returnCondition}` : ''}
                    </p>
                    {entry.notes ? <p className="mt-0.5 text-xs text-slate-500">{entry.notes}</p> : null}
                  </div>
                  {entry.returnedAt ? (
                    <Badge tone="neutral">Returned</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">This asset has not been assigned yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-slate-800">{value}</div>
    </div>
  );
}
