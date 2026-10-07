import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldCheck, ShieldOff, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import {
  deleteDocument,
  downloadDocument,
  listDocuments,
  uploadDocument,
  verifyDocument,
} from '@/services/document.service';
import { listEmployees } from '@/services/employee.service';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type EmployeeDocument,
} from '@/types/document';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({ value: type.value, label: type.label }));

export function DocumentsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();

  const canReadAny = can(role, 'document:read:any');
  const canUpload = can(role, 'document:upload');
  const canVerify = can(role, 'document:verify');
  const canDelete = can(role, 'document:delete');

  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [verified, setVerified] = useState('');
  const [expiry, setExpiry] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState<EmployeeDocument | null>(null);
  const [deleting, setDeleting] = useState<EmployeeDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const documents = useQuery({
    queryKey: ['documents', 'list', { page, type, verified, expiry, employeeId }],
    queryFn: () =>
      listDocuments({
        page,
        limit: 20,
        type: (type || undefined) as DocumentType | undefined,
        isVerified: verified === '' ? undefined : verified === 'true',
        expiringWithinDays: expiry === '' ? undefined : Number(expiry),
        employeeId: canReadAny && employeeId ? employeeId : undefined,
        sortOrder: 'desc',
      }),
  });

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    enabled: canReadAny,
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: (document) => {
      toast.success(`${document.title} uploaded`);
      setUploading(false);
      invalidate();
    },
    onError: (error) => {
      toast.error(toMessage(error));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (input: { id: string; isVerified: boolean }) =>
      verifyDocument(input.id, { isVerified: input.isVerified }),
    onSuccess: (document) => {
      toast.success(document.isVerified ? 'Document verified' : 'Verification removed');
      setVerifying(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(toMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      toast.success('Document deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(toMessage(error));
    },
  });

  const handleDownload = async (row: EmployeeDocument) => {
    setDownloadingId(row.id);
    try {
      await downloadDocument(row);
    } catch (error) {
      toast.error(toMessage(error));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns = useMemo<Column<EmployeeDocument>[]>(() => {
    const base: Column<EmployeeDocument>[] = [
      {
        key: 'title',
        header: 'Document',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.title}</p>
            <p className="truncate text-xs text-slate-500">{row.fileName}</p>
          </div>
        ),
      },
      {
        key: 'employee',
        header: 'Employee',
        render: (row) => (
          <span className="text-slate-700">{fullName(row.employee)}</span>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        render: (row) => (
          <span className="text-slate-700">
            {DOCUMENT_TYPES.find((entry) => entry.value === row.type)?.label ?? row.type}
          </span>
        ),
      },
      { key: 'size', header: 'Size', render: (row) => <span className="text-slate-600">{formatBytes(row.sizeBytes)}</span> },
      { key: 'uploadedAt', header: 'Uploaded', render: (row) => <span className="text-slate-700">{formatDate(row.uploadedAt)}</span> },
      {
        key: 'expiresAt',
        header: 'Expires',
        render: (row) => {
          if (!row.expiresAt) return <span className="text-slate-400">-</span>;
          const daysLeft = Math.floor(
            (new Date(`${row.expiresAt}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
          );
          const expiring = daysLeft <= 30;
          return (
            <span className={expiring ? 'font-medium text-amber-600' : 'text-slate-700'}>
              {formatDate(row.expiresAt)}
              {expiring ? ' (soon)' : ''}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) =>
          row.isVerified ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <Badge tone="warning">Pending</Badge>
          ),
      },
      {
        key: 'actions',
        header: '',
        headerClassName: 'text-right',
        className: 'text-right',
        render: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownload(row)}
              isLoading={downloadingId === row.id}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Download
            </Button>
            {canVerify ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVerifying(row)}
                leftIcon={row.isVerified ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              >
                {row.isVerified ? 'Reopen' : 'Verify'}
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleting(row)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ),
      },
    ];

    return canReadAny ? base : base.filter((column) => column.key !== 'employee');
  }, [canReadAny, canVerify, canDelete, downloadingId]);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Identity, employment and compliance records for every employee."
        actions={
          canUpload ? (
            <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setUploading(true)}>
              Upload document
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <div className="w-48">
            <Select
              label="Type"
              placeholder="All types"
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(event.target.value);
              }}
              options={TYPE_OPTIONS}
            />
          </div>
          <div className="w-44">
            <Select
              label="Verification"
              placeholder="Any status"
              value={verified}
              onChange={(event) => {
                setPage(1);
                setVerified(event.target.value);
              }}
              options={[
                { value: 'true', label: 'Verified' },
                { value: 'false', label: 'Pending' },
              ]}
            />
          </div>
          <div className="w-44">
            <Select
              label="Expiring"
              placeholder="Any date"
              value={expiry}
              onChange={(event) => {
                setPage(1);
                setExpiry(event.target.value);
              }}
              options={[
                { value: '30', label: 'Within 30 days' },
                { value: '90', label: 'Within 90 days' },
                { value: '365', label: 'Within a year' },
              ]}
            />
          </div>
          {canReadAny ? (
            <div className="w-60">
              <Select
                label="Employee"
                placeholder="All employees"
                value={employeeId}
                onChange={(event) => {
                  setPage(1);
                  setEmployeeId(event.target.value);
                }}
                options={(employees.data?.items ?? []).map((employee) => ({
                  value: employee.id,
                  label: fullName(employee) || employee.email,
                }))}
              />
            </div>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={documents.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={documents.isPending}
          isFetching={documents.isFetching}
          error={documents.error}
          onRetry={() => void documents.refetch()}
          emptyTitle="No documents yet"
          emptyDescription="Upload an identity or employment record to get started."
        />
        <Pagination meta={documents.data?.meta} onPageChange={setPage} />
      </Card>

      {uploading ? (
        <UploadDocumentDialog
          canPickEmployee={canReadAny}
          employees={(employees.data?.items ?? []).map((employee) => ({
            value: employee.id,
            label: fullName(employee) || employee.email,
          }))}
          isSubmitting={uploadMutation.isPending}
          onCancel={() => setUploading(false)}
          onSubmit={(payload) => uploadMutation.mutate(payload)}
        />
      ) : null}

      {verifying ? (
        <ConfirmDialog
          open
          title={verifying.isVerified ? 'Reopen document?' : 'Verify document?'}
          message={
            verifying.isVerified
              ? `"${verifying.title}" will go back to pending and the verifier will be cleared.`
              : `"${verifying.title}" will be marked as verified under your name.`
          }
          confirmLabel={verifying.isVerified ? 'Reopen' : 'Verify'}
          isLoading={verifyMutation.isPending}
          onCancel={() => setVerifying(null)}
          onConfirm={() => verifyMutation.mutate({ id: verifying.id, isVerified: !verifying.isVerified })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open
          tone="danger"
          title="Delete document?"
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

interface UploadDocumentDialogProps {
  canPickEmployee: boolean;
  employees: { value: string; label: string }[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    type: DocumentType;
    title: string;
    employeeId?: string;
    expiresAt?: string;
    file: File;
  }) => void;
}

function UploadDocumentDialog({
  canPickEmployee,
  employees,
  isSubmitting,
  onCancel,
  onSubmit,
}: UploadDocumentDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>('PAN');
  const [title, setTitle] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const fileRefValue = useRef<File | null>(null);

  const submit = () => {
    const file = fileRefValue.current;
    if (!file) {
      setFileError('Choose a file to upload');
      return;
    }
    if (title.trim().length < 2) return;
    onSubmit({
      type,
      title: title.trim(),
      employeeId: canPickEmployee && employeeId ? employeeId : undefined,
      expiresAt: expiresAt || undefined,
      file,
    });
  };

  return (
    <Modal
      open
      title="Upload document"
      onClose={onCancel}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            onClick={submit}
            isLoading={isSubmitting}
            disabled={title.trim().length < 2 || isSubmitting}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Upload
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Document type"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value as DocumentType)}
          options={TYPE_OPTIONS}
        />
        <Input
          label="Title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. PAN Card"
          maxLength={160}
          required
        />
        {canPickEmployee ? (
          <Select
            label="Employee"
            name="employeeId"
            placeholder="My own record"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            options={employees}
          />
        ) : null}
        <Input
          label="Expires on"
          name="expiresAt"
          type="date"
          hint="Leave blank if this document never expires."
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
        <Input
          ref={fileRef}
          label="File"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          error={fileError}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            fileRefValue.current = file;
            setFileName(file?.name ?? '');
            setFileError('');
          }}
          hint={fileName ? `Selected: ${fileName}` : 'PDF, JPEG or PNG up to 10 MB.'}
        />
      </div>
    </Modal>
  );
}