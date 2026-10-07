import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Search, ShieldCheck, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDateTime, fullName } from '@/lib/utils';
import { listEmployees } from '@/services/employee.service';
import { createUser, listUsers, resetUserPassword, updateUserRole, updateUserStatus } from '@/services/user.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Role } from '@/types/api';
import type { UserAccount, UserStatus } from '@/types/user';

const ROLE_VALUES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'MANAGER', 'FINANCE', 'RECRUITER', 'EMPLOYEE'] as const;

const ROLE_OPTIONS = ROLE_VALUES.map((value) => ({ value, label: value.replace(/_/g, ' ') }));

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PENDING_ACTIVATION', label: 'Pending activation' },
];

const EDITABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.value !== 'PENDING_ACTIVATION');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').regex(EMAIL_PATTERN, 'Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
  role: z.enum(ROLE_VALUES),
  employeeId: z.string().optional(),
  mustChangePassword: z.boolean(),
});

type CreateFormValues = z.infer<typeof createSchema>;

const emptyCreateValues: CreateFormValues = {
  email: '',
  password: '',
  role: 'EMPLOYEE',
  employeeId: '',
  mustChangePassword: true,
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const canManage = can(currentUser?.role, 'user:manage');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roleTarget, setRoleTarget] = useState<UserAccount | null>(null);
  const [statusTarget, setStatusTarget] = useState<UserAccount | null>(null);
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users', 'list', { page, search, roleFilter, statusFilter, unlinkedOnly }],
    queryFn: () =>
      listUsers({
        page,
        limit: 20,
        search,
        ...(roleFilter ? { role: roleFilter as Role } : {}),
        ...(statusFilter ? { status: statusFilter as UserStatus } : {}),
        ...(unlinkedOnly ? { unlinkedOnly: true } : {}),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (values: CreateFormValues) =>
      createUser({
        email: values.email,
        password: values.password,
        role: values.role,
        mustChangePassword: values.mustChangePassword,
        ...(values.employeeId ? { employeeId: values.employeeId } : {}),
      }),
    onSuccess: () => {
      toast.success('User account created');
      setCreating(false);
      setFormError(null);
      invalidate();
    },
    onError: (error) => {
      setFormError(toMessage(error));
      toast.error(toMessage(error));
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => updateUserRole(id, role),
    onSuccess: () => {
      toast.success('Role updated');
      setRoleTarget(null);
      invalidate();
    },
    onError: (error) => {
      setRoleTarget(null);
      toast.error(toMessage(error));
    },
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; reason?: string }) =>
      updateUserStatus(id, { status, ...(reason ? { reason } : {}) }),
    onSuccess: () => {
      toast.success('Account status updated');
      setStatusTarget(null);
      invalidate();
    },
    onError: (error) => {
      setStatusTarget(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<UserAccount>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.email}</p>
          <p className="text-xs text-slate-500">
            {row.employee
              ? `${fullName(row.employee)} · ${row.employee.employeeCode}`
              : 'Not linked to an employee'}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge tone={row.role === 'SUPER_ADMIN' ? 'purple' : 'info'}>{row.role.replace(/_/g, ' ')}</Badge>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => <span className="text-slate-600">{formatDateTime(row.lastLoginAt, 'Never')}</span>,
    },
    {
      key: 'password',
      header: 'Must change password',
      render: (row) =>
        row.mustChangePassword ? <Badge tone="warning">Yes</Badge> : <span className="text-slate-400">No</span>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: UserAccount) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Change role of ${row.email}`}
                  disabled={row.id === currentUser?.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFormError(null);
                    setRoleTarget(row);
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Change status of ${row.email}`}
                  disabled={row.id === currentUser?.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setStatusTarget(row);
                  }}
                >
                  <UserCog className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Reset password for ${row.email}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setResetTarget(row);
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
            ),
          } satisfies Column<UserAccount>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="Create login accounts, assign roles and control who can access the system."
        actions={
          canManage ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setFormError(null);
                setCreating(true);
              }}
            >
              New user
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
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
              placeholder="Search by email or employee name"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(event.target.value);
              }}
              options={ROLE_OPTIONS}
              placeholder="All roles"
            />
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
              options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="All statuses"
            />
            <label className="flex h-10 items-center gap-2 whitespace-nowrap text-sm text-slate-600">
              <input
                type="checkbox"
                checked={unlinkedOnly}
                onChange={(event) => {
                  setPage(1);
                  setUnlinkedOnly(event.target.checked);
                }}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Not linked to employee
            </label>
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                setSearch(searchDraft.trim());
              }}
            >
              Search
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={users.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={users.isPending}
          isFetching={users.isFetching}
          error={users.error}
          onRetry={() => void users.refetch()}
          emptyTitle="No users found"
          emptyDescription={canManage ? 'Create a user account to let someone sign in.' : 'Try adjusting the filters.'}
          emptyAction={
            canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                New user
              </Button>
            ) : null
          }
          footer={<Pagination meta={users.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {creating ? (
        <CreateUserDialog
          formError={formError}
          isSubmitting={create.isPending}
          onClose={() => {
            setCreating(false);
            setFormError(null);
          }}
          onSubmit={(values) => create.mutate(values)}
        />
      ) : null}

      <RoleDialog
        key={roleTarget?.id ?? 'no-role-target'}
        user={roleTarget}
        formError={formError}
        isSubmitting={changeRole.isPending}
        onClose={() => {
          setRoleTarget(null);
          setFormError(null);
        }}
        onSubmit={(role) => roleTarget && changeRole.mutate({ id: roleTarget.id, role })}
      />

      <StatusDialog
        key={statusTarget?.id ?? 'no-status-target'}
        user={statusTarget}
        isSubmitting={changeStatus.isPending}
        onClose={() => setStatusTarget(null)}
        onSubmit={(payload) => statusTarget && changeStatus.mutate({ id: statusTarget.id, ...payload })}
      />

      <ResetPasswordDialog
        key={resetTarget?.id ?? 'no-reset-target'}
        user={resetTarget}
        onClose={() => setResetTarget(null)}
        onSuccess={invalidate}
      />
    </>
  );
}

function CreateUserDialog({
  formError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  formError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: CreateFormValues) => void;
}) {
  const [values, setValues] = useState<CreateFormValues>(emptyCreateValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employees = useQuery({
    queryKey: ['employees', 'user-link-options'],
    queryFn: () => listEmployees({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'firstName', sortOrder: 'asc' }),
  });

  const employeeOptions = (employees.data?.items ?? [])
    .filter((employee) => !employee.user)
    .map((employee) => ({ value: employee.id, label: `${fullName(employee)} · ${employee.employeeCode}` }));

  const submit = () => {
    const result = createSchema.safeParse(values);
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
      title="New user"
      description="The account must change its password on first sign-in by default."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            Create user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p> : null}
        <Input
          label="Email"
          type="email"
          autoComplete="off"
          value={values.email}
          error={errors.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
        <Input
          label="Temporary password"
          hint="At least 8 characters with upper, lower and a number."
          autoComplete="new-password"
          value={values.password}
          error={errors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
        <Select
          label="Role"
          value={values.role}
          error={errors.role}
          options={ROLE_OPTIONS}
          onChange={(event) => setValues({ ...values, role: event.target.value as Role })}
        />
        <Select
          label="Link to employee (optional)"
          value={values.employeeId}
          error={errors.employeeId}
          options={employeeOptions}
          placeholder="Not linked"
          disabled={employees.isPending}
          onChange={(event) => setValues({ ...values, employeeId: event.target.value })}
        />
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={values.mustChangePassword}
            onChange={(event) => setValues({ ...values, mustChangePassword: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Require a password change on first sign-in
        </label>
      </div>
    </Modal>
  );
}

function RoleDialog({
  user,
  formError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  user: UserAccount | null;
  formError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(user?.role ?? 'EMPLOYEE');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const submit = () => {
    if (role === user.role) {
      setError('Choose a different role');
      return;
    }
    setError(null);
    onSubmit(role);
  };

  return (
    <Modal
      open
      title={`Change role · ${user.email}`}
      description="Changing a role takes effect on the user's next request."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            Save role
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p> : null}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Current role</span>
          <Badge tone="info">{user.role.replace(/_/g, ' ')}</Badge>
        </div>
        <Select
          label="New role"
          value={role}
          error={error ?? undefined}
          options={ROLE_OPTIONS}
          onChange={(event) => setRole(event.target.value as Role)}
        />
      </div>
    </Modal>
  );
}

function StatusDialog({
  user,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  user: UserAccount | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; reason?: string }) => void;
}) {
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [reason, setReason] = useState('');

  if (!user) return null;

  const currentEditable = EDITABLE_STATUS_OPTIONS.some((option) => option.value === user.status);

  const submit = () => {
    onSubmit({ status, ...(reason.trim() ? { reason: reason.trim() } : {}) });
  };

  return (
    <Modal
      open
      title={`Account status · ${user.email}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit} disabled={status === user.status && currentEditable}>
            Update status
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">Current status</span>
          <StatusBadge status={user.status} />
        </div>
        <Select
          label="New status"
          value={status}
          options={EDITABLE_STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED')}
        />
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Suspending or deactivating signs the user out everywhere and revokes all refresh tokens.
        </p>
        <Input
          label="Reason (optional)"
          hint="Stored in the audit log alongside the change."
          value={reason}
          maxLength={255}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: UserAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'generate' | 'set'>('generate');
  const [newPassword, setNewPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: (payload: { newPassword?: string; mustChangePassword?: boolean }) => {
      if (!user) throw new Error('No user selected');
      return resetUserPassword(user.id, payload);
    },
    onSuccess: (result) => {
      setError(null);
      setTemporaryPassword(result.temporaryPassword);
      setNewPassword('');
      onSuccess();
      toast.success('Password reset');
    },
    onError: (apiError) => setError(toMessage(apiError)),
  });

  if (!user) return null;

  const submit = () => {
    setTemporaryPassword(null);
    if (mode === 'set') {
      const result = createSchema.pick({ password: true }).safeParse({ password: newPassword });
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? 'Invalid password');
        return;
      }
      reset.mutate({ newPassword, mustChangePassword });
      return;
    }
    reset.mutate({ mustChangePassword });
  };

  if (temporaryPassword) {
    return (
      <Modal
        open
        title="Temporary password"
        description={`Share this with ${user.email}. It is shown only once.`}
        onClose={onClose}
        size="sm"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
            <code className="break-all font-mono text-sm text-emerald-300">{temporaryPassword}</code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy temporary password"
              onClick={() => {
                void navigator.clipboard.writeText(temporaryPassword);
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            The account is signed out everywhere and must change this password on next sign-in.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={`Reset password · ${user.email}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={reset.isPending} onClick={submit}>
            Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <Select
          label="Method"
          value={mode}
          options={[
            { value: 'generate', label: 'Generate a temporary password' },
            { value: 'set', label: 'Set a specific password' },
          ]}
          onChange={(event) => {
            setMode(event.target.value as 'generate' | 'set');
            setError(null);
          }}
        />
        {mode === 'set' ? (
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            A one-time temporary password is generated and shown after the reset.
          </p>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={mustChangePassword}
            onChange={(event) => setMustChangePassword(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Require a password change on next sign-in
        </label>
      </div>
    </Modal>
  );
}
