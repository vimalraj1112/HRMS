import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, fullName } from '@/lib/utils';
import { correctAttendance, listAttendance, markAttendance, type AttendanceScope } from '@/services/attendance.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  ATTENDANCE_STATUSES,
  SELF_MARKABLE_STATUSES,
  type AttendanceRecord,
  type AttendanceStatus,
} from '@/types/time';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const markSchema = z
  .object({
    employeeId: z.string().optional(),
    date: z.string().min(1, 'Pick a date'),
    status: z.string().min(1),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    workFrom: z.string().optional(),
    workTo: z.string().optional(),
    notes: z.string().max(255).optional(),
  })
  .refine((value) => !value.checkIn || TIME_PATTERN.test(value.checkIn), {
    path: ['checkIn'],
    message: 'Use the 24 hour HH:MM format',
  })
  .refine((value) => !value.checkOut || TIME_PATTERN.test(value.checkOut), {
    path: ['checkOut'],
    message: 'Use the 24 hour HH:MM format',
  })
  .refine((value) => !value.checkIn || !value.checkOut || value.checkOut > value.checkIn, {
    path: ['checkOut'],
    message: 'Check out must be after check in',
  });

type MarkValues = z.infer<typeof markSchema>;

const emptyValues: MarkValues = {
  employeeId: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'PRESENT',
  checkIn: '09:00',
  checkOut: '',
  workFrom: '',
  workTo: '',
  notes: '',
};

function clock(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date);
}

function duration(minutes: number | null): string {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

const COPY: Record<AttendanceScope, { title: string; description: string }> = {
  my: {
    title: 'My Attendance',
    description: 'Your daily attendance, check in times and monthly summary.',
  },
  team: {
    title: 'Team Attendance',
    description: 'Attendance for you and your direct reports.',
  },
  all: {
    title: 'Attendance',
    description: 'Organisation wide attendance register with monthly summaries.',
  },
};

export function AttendanceRegisterPage({ scope }: { scope: AttendanceScope }) {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canCorrect = can(role, 'attendance:correct');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<AttendanceStatus | ''>('');
  const [marking, setMarking] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);

  const register = useQuery({
    queryKey: ['attendance', scope, { page, search, from, to, status }],
    queryFn: () =>
      listAttendance(scope, {
        page,
        limit: 20,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        status: status || undefined,
        sortBy: 'date',
        sortOrder: 'desc',
      }),
  });

  const resetPage = () => setPage(1);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  const save = useMutation({
    mutationFn: (values: MarkValues) => {
      if (correcting) {
        return correctAttendance(correcting.id, {
          status: values.status as AttendanceStatus,
          ...(values.checkIn ? { checkIn: values.checkIn } : {}),
          ...(values.checkOut ? { checkOut: values.checkOut } : {}),
          ...(values.workFrom ? { workFrom: values.workFrom } : {}),
          ...(values.workTo ? { workTo: values.workTo } : {}),
          ...(values.notes ? { notes: values.notes } : {}),
        });
      }

      return markAttendance({
        employeeId: values.employeeId || undefined,
        date: values.date,
        status: values.status as AttendanceStatus,
        ...(values.checkIn ? { checkIn: values.checkIn } : {}),
        ...(values.checkOut ? { checkOut: values.checkOut } : {}),
        ...(values.workFrom ? { workFrom: values.workFrom } : {}),
        ...(values.workTo ? { workTo: values.workTo } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      });
    },
    onSuccess: () => {
      toast.success(correcting ? 'Attendance corrected' : 'Attendance recorded');
      setMarking(false);
      setCorrecting(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const columns: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', render: (row) => <span className="text-slate-700">{formatDate(row.date)}</span> },
    ...(scope === 'my'
      ? []
      : [
          {
            key: 'employee',
            header: 'Employee',
            render: (row: AttendanceRecord) => (
              <div>
                <p className="font-medium text-slate-900">{fullName(row.employee)}</p>
                <p className="text-xs text-slate-500">
                  {row.employee.employeeCode}
                  {row.employee.department ? ` · ${row.employee.department.name}` : ''}
                </p>
              </div>
            ),
          } satisfies Column<AttendanceRecord>,
        ]),
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'in', header: 'Check in', render: (row) => <span className="text-slate-700">{clock(row.checkIn)}</span> },
    { key: 'out', header: 'Check out', render: (row) => <span className="text-slate-700">{clock(row.checkOut)}</span> },
    { key: 'hours', header: 'Worked', render: (row) => <span className="text-slate-700">{duration(row.totalMinutes)}</span> },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <Badge tone={row.source === 'SYSTEM' ? 'info' : 'neutral'}>{row.source}</Badge>,
    },
    ...(canCorrect
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: AttendanceRecord) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Correct attendance for ${formatDate(row.date)}`}
                onClick={() => setCorrecting(row)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ),
          } satisfies Column<AttendanceRecord>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={COPY[scope].title}
        description={COPY[scope].description}
        actions={
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setMarking(true);
              save.reset();
            }}
          >
            {scope === 'my' ? 'Mark today' : 'Record attendance'}
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              resetPage();
              setSearch(searchDraft.trim());
            }}
          >
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by name or employee code"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input type="date" value={from} onChange={(event) => { resetPage(); setFrom(event.target.value); }} aria-label="From date" />
            <Input type="date" value={to} onChange={(event) => { resetPage(); setTo(event.target.value); }} aria-label="To date" />
            <Select
              value={status}
              onChange={(event) => { resetPage(); setStatus(event.target.value as AttendanceStatus | ''); }}
              options={ATTENDANCE_STATUSES.map((option) => ({ value: option.value, label: option.label }))}
              placeholder="All statuses"
              aria-label="Status"
            />
            <Button
              variant="secondary"
              onClick={() => {
                resetPage();
                setSearch(searchDraft.trim());
              }}
            >
              Search
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={register.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={register.isPending}
          isFetching={register.isFetching}
          error={register.error}
          onRetry={() => void register.refetch()}
          emptyTitle="No attendance records"
          emptyDescription="Try widening the date range or clearing the filters."
          footer={<Pagination meta={register.data?.meta} onPageChange={setPage} />}
        />
      </Card>

      {marking || correcting !== null ? (
        <AttendanceDialog
          key={correcting?.id ?? 'new'}
          record={correcting}
          canPickEmployee={scope !== 'my'}
          isSubmitting={save.isPending}
          onClose={() => {
            setMarking(false);
            setCorrecting(null);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      ) : null}
    </>
  );
}

function AttendanceDialog({
  record,
  canPickEmployee,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  record: AttendanceRecord | null;
  canPickEmployee: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: MarkValues) => void;
}) {
  const editing = record !== null;
  const [values, setValues] = useState<MarkValues>(() =>
    record
      ? {
          employeeId: record.employeeId,
          date: record.date.slice(0, 10),
          status: record.status,
          checkIn: clock(record.checkIn) === '—' ? '' : clock(record.checkIn),
          checkOut: clock(record.checkOut) === '—' ? '' : clock(record.checkOut),
          workFrom: record.workFrom ?? '',
          workTo: record.workTo ?? '',
          notes: record.notes ?? '',
        }
      : emptyValues,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const statusOptions = editing
    ? ATTENDANCE_STATUSES
    : canPickEmployee
      ? ATTENDANCE_STATUSES
      : ATTENDANCE_STATUSES.filter((option) => (SELF_MARKABLE_STATUSES as readonly string[]).includes(option.value));

  const submit = () => {
    const result = markSchema.safeParse(values);
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
      title={editing ? `Correct attendance · ${formatDate(record.date)}` : 'Record attendance'}
      description={
        editing
          ? 'Correcting a record marks it as corrected for audit purposes.'
          : 'Records are unique per employee and date, so saving again corrects the existing record.'
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            {editing ? 'Save correction' : 'Save record'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing ? (
          <Input
            label="Date"
            type="date"
            value={values.date}
            error={errors.date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setValues({ ...values, date: event.target.value })}
          />
        ) : null}

        <Select
          label="Status"
          value={values.status}
          error={errors.status}
          options={statusOptions.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(event) => setValues({ ...values, status: event.target.value })}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Check in"
            type="time"
            value={values.checkIn ?? ''}
            error={errors.checkIn}
            onChange={(event) => setValues({ ...values, checkIn: event.target.value })}
          />
          <Input
            label="Check out"
            type="time"
            value={values.checkOut ?? ''}
            error={errors.checkOut}
            onChange={(event) => setValues({ ...values, checkOut: event.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Work from"
            placeholder="Home"
            value={values.workFrom ?? ''}
            onChange={(event) => setValues({ ...values, workFrom: event.target.value })}
          />
          <Input
            label="Work to"
            placeholder="Bengaluru"
            value={values.workTo ?? ''}
            onChange={(event) => setValues({ ...values, workTo: event.target.value })}
          />
        </div>

        <Textarea
          label="Notes"
          value={values.notes ?? ''}
          error={errors.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </div>
    </Modal>
  );
}

export function MyAttendancePage() {
  return <AttendanceRegisterPage scope="my" />;
}

export function TeamAttendancePage() {
  return <AttendanceRegisterPage scope="team" />;
}

export function AttendancePage() {
  return <AttendanceRegisterPage scope="all" />;
}
