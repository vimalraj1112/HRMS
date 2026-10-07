import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Mail, Pencil, Phone, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmployeeForm } from '@/components/employees/EmployeeForm';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/States';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { changeEmployeeStatus, deleteEmployee, getEmployee, updateEmployee } from '@/services/employee.service';
import { useAuthStore } from '@/stores/auth.store';
import { EMPLOYEE_STATUSES, type EmployeeDetail, type EmployeeStatus } from '@/types/hr';
import { formatDate, formatDateTime, fullName, initials } from '@/lib/utils';

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  return <EmployeeProfile id={id} />;
}

export function EmployeeProfile({ id, selfService = false }: { id: string; selfService?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const ownEmployeeId = useAuthStore((state) => state.user?.employee?.id ?? null);

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const employee = useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => getEmployee(id),
    enabled: Boolean(id),
  });

  const save = useMutation({
    mutationFn: (values: Record<string, string>) => updateEmployee(id, values),
    onSuccess: () => {
      toast.success('Employee updated');
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: (values: { status: EmployeeStatus; exitDate?: string; reason?: string }) =>
      changeEmployeeStatus(id, values),
    onSuccess: () => {
      toast.success('Status updated');
      setStatusOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => deleteEmployee(id),
    onSuccess: () => {
      toast.success('Employee removed');
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void navigate('/employees', { replace: true });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  if (employee.isPending) return <Spinner label="Loading employee" />;

  if (employee.isError) {
    return (
      <>
        <PageHeader title="Employee" breadcrumbs={[{ label: 'Employees', to: '/employees' }, { label: 'Not found' }]} />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-semibold text-slate-900">This employee record is not available</p>
            <p className="mt-1 text-sm text-slate-500">{toMessage(employee.error)}</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/employees')}>
              Back to employees
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const record = employee.data;
  const isSelf = ownEmployeeId === record.id;
  const canEdit = can(role, 'employee:update') || isSelf;
  const canChangeStatus = can(role, 'employee:status');
  const canDelete = can(role, 'employee:delete');
  const canSeeSensitive = can(role, 'employee:read:any') || isSelf;

  return (
    <>
      <PageHeader
        title={fullName(record)}
        description={`${record.employeeCode} · ${record.email}`}
        breadcrumbs={
          selfService
            ? undefined
            : [{ label: 'Employees', to: '/employees' }, { label: record.employeeCode }]
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!selfService ? (
              <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/employees')}>
                Back
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => setEditOpen(true)}
              >
                {isSelf && !can(role, 'employee:update') ? 'Edit contact details' : 'Edit'}
              </Button>
            ) : null}
            {canChangeStatus ? (
              <Button variant="secondary" onClick={() => setStatusOpen(true)}>
                Change status
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6 text-center">
            <Avatar src={record.profilePhotoUrl} fallback={initials(record.firstName, record.lastName)} size="xl" />
            <p className="mt-3 text-base font-semibold text-slate-900">{fullName(record)}</p>
            <p className="text-sm text-slate-500">{record.designation?.name ?? 'No designation'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <StatusBadge status={record.status} />
              {record.user ? <Badge tone="purple">{record.user.role.replace(/_/g, ' ')}</Badge> : null}
            </div>

            <dl className="mt-5 w-full space-y-3 text-left text-sm">
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={record.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={record.phone ?? '—'} />
              <InfoRow icon={<Building2 className="h-4 w-4" />} label="Department" value={record.department?.name ?? 'Unassigned'} />
              <InfoRow icon={<UserRound className="h-4 w-4" />} label="Reports to" value={record.manager ? fullName(record.manager) : '—'} />
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Employment" />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Employee code" value={record.employeeCode} />
              <Detail label="Employment type" value={record.employmentType.replace(/_/g, ' ').toLowerCase()} />
              <Detail label="Joining date" value={formatDate(record.joiningDate)} />
              <Detail label="Exit date" value={record.exitDate ? formatDate(record.exitDate) : '—'} />
              <Detail label="Department" value={record.department ? `${record.department.name} (${record.department.code})` : 'Unassigned'} />
              <Detail label="Designation" value={record.designation ? record.designation.name : 'Unassigned'} />
              <Detail label="Gender" value={record.gender ? record.gender.toLowerCase() : '—'} />
              <Detail label="Date of birth" value={record.dateOfBirth ? formatDate(record.dateOfBirth) : '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Address" value={record.address ?? '—'} wide />
              <Detail label="City" value={record.city ?? '—'} />
              <Detail label="State" value={record.state ?? '—'} />
              <Detail label="Postal code" value={record.postalCode ?? '—'} />
              <Detail label="Country" value={record.country ?? '—'} />
              <Detail
                label="Emergency contact"
                value={
                  record.emergencyContactName
                    ? `${record.emergencyContactName}${record.emergencyContactPhone ? ` · ${record.emergencyContactPhone}` : ''}`
                    : '—'
                }
              />
            </CardContent>
          </Card>

          {canSeeSensitive ? (
            <Card>
              <CardHeader title="Documents and banking" description="Visible to HR and the employee themselves." />
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Detail label="PAN number" value={record.panNumber ?? '—'} />
                <Detail label="Aadhaar number" value={record.aadhaarNumber ?? '—'} />
                <Detail label="Bank name" value={record.bankName ?? '—'} />
                <Detail label="IFSC code" value={record.bankIfsc ?? '—'} />
                <Detail label="Account number" value={record.bankAccountNumber ?? '—'} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-start gap-3 py-5">
                <ShieldAlert className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <p className="text-sm text-slate-500">
                  Document and banking details are restricted to the employee and HR administrators.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Direct reports" description={`${record.directReports.length} reporting to this employee`} />
            {record.directReports.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-slate-500">No direct reports yet.</CardContent>
            ) : (
              <ul className="divide-y divide-slate-100">
                {record.directReports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/employees/${report.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar fallback={initials(report.firstName, report.lastName)} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{fullName(report)}</p>
                          <p className="text-xs text-slate-500">{report.employeeCode}</p>
                        </div>
                      </div>
                      <StatusBadge status={report.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-xs text-slate-400">
            Last updated {formatDateTime(record.updatedAt)} · created {formatDateTime(record.createdAt)}
          </p>
        </div>
      </div>

      <Modal
        open={editOpen}
        title={isSelf && !can(role, 'employee:update') ? 'Edit contact details' : `Edit ${fullName(record)}`}
        description="Changes are recorded in the audit log."
        onClose={() => setEditOpen(false)}
        size="lg"
      >
        <EmployeeForm
          mode={isSelf && !can(role, 'employee:update') ? 'self' : 'edit'}
          defaultValues={record}
          isSubmitting={save.isPending}
          onSubmit={(values) => save.mutate(values)}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <StatusDialog
        open={statusOpen}
        employee={record}
        isSubmitting={changeStatus.isPending}
        onClose={() => setStatusOpen(false)}
        onSubmit={(values) => changeStatus.mutate(values)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete employee"
        message={`This permanently removes ${fullName(record)} (${record.employeeCode}). Only resigned or terminated employees with no attendance, leave or payroll history can be deleted.`}
        confirmLabel="Delete permanently"
        isLoading={remove.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function StatusDialog({
  open,
  employee,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  employee: EmployeeDetail;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: { status: EmployeeStatus; exitDate?: string; reason?: string }) => void;
}) {
  const [status, setStatus] = useState<EmployeeStatus>(employee.status);
  const [exitDate, setExitDate] = useState('');
  const [reason, setReason] = useState('');

  const needsExitDate = status === 'TERMINATED' || status === 'RESIGNED';

  return (
    <Modal
      open={open}
      title="Change employment status"
      description={employee.employeeCode}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            onClick={() =>
              onSubmit({
                status,
                ...(needsExitDate && exitDate ? { exitDate } : {}),
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              })
            }
          >
            Update status
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="New status"
          options={EMPLOYEE_STATUSES}
          value={status}
          onChange={(event) => setStatus(event.target.value as EmployeeStatus)}
        />
        {needsExitDate ? (
          <Input
            label="Exit date"
            type="date"
            value={exitDate}
            onChange={(event) => setExitDate(event.target.value)}
            hint="Defaults to today when left blank"
          />
        ) : null}
        <Textarea
          label="Reason"
          placeholder="Recorded in the audit log"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Suspending an employee revokes their active sessions immediately.
        </p>
      </div>
    </Modal>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="truncate font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
