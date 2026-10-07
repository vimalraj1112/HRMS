import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, fullName } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import { listDepartments, listDesignations } from '@/services/organization.service';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  markAnnouncementRead,
  unreadAnnouncementCount,
  updateAnnouncement,
} from '@/services/announcement.service';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_ROLES,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementPayload,
} from '@/types/announcement';
import type { Role } from '@/types/api';

const AUDIENCE_OPTIONS = [{ value: '', label: 'All audiences' }, ...ANNOUNCEMENT_AUDIENCES];

function audienceLabel(row: Announcement): string {
  switch (row.audience) {
    case 'DEPARTMENT':
      return row.department ? `Department · ${row.department.name}` : 'Department';
    case 'DESIGNATION':
      return row.designation ? `Designation · ${row.designation.name}` : 'Designation';
    case 'ROLE':
      return row.role ? `Role · ${row.role.replace(/_/g, ' ')}` : 'Role';
    case 'EMPLOYEE':
      return row.employee ? `Employee · ${fullName(row.employee)}` : 'Employee';
    default:
      return 'Everyone';
  }
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AnnouncementsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();
  const canManage = can(role, 'announcement:manage');
  const canRead = can(role, 'announcement:read');

  const [page, setPage] = useState(1);
  const [audience, setAudience] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const announcements = useQuery({
    queryKey: ['announcements', { page, audience }],
    queryFn: () =>
      listAnnouncements({
        page,
        limit: 20,
        audience: (audience || undefined) as AnnouncementAudience | undefined,
      }),
  });

  const unread = useQuery({
    queryKey: ['announcements', 'unread'],
    enabled: canRead,
    queryFn: unreadAnnouncementCount,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
  };

  const markRead = useMutation({
    mutationFn: markAnnouncementRead,
    onSuccess: () => {
      toast.success('Marked as read');
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      toast.success('Announcement deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <div>
          <div className="flex items-center gap-1.5">
            {row.isPinned ? <Pin className="h-3.5 w-3.5 text-amber-500" aria-label="Pinned" /> : null}
            <p className="font-medium text-slate-900">{row.title}</p>
          </div>
          <p className="line-clamp-1 text-xs text-slate-500">{row.content}</p>
        </div>
      ),
    },
    { key: 'audience', header: 'Audience', render: (row) => audienceLabel(row) },
    {
      key: 'published',
      header: 'Published',
      render: (row) => (
        <div>
          <p className="text-slate-700">{formatDateTime(row.publishedAt)}</p>
          <p className="text-xs text-slate-500">Expires {formatDate(row.expiresAt)}</p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => {
        if (row.isRead === undefined) return <span className="text-xs text-slate-400">-</span>;
        return row.isRead ? (
          <Badge tone="neutral">Read</Badge>
        ) : (
          <Badge tone="info">Unread</Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (row) => {
        const items: ReactNode[] = [];

        if (row.isRead === false) {
          items.push(
            <Button
              key="read"
              variant="ghost"
              size="icon"
              aria-label="Mark as read"
              isLoading={markRead.isPending && markRead.variables === row.id}
              onClick={() => markRead.mutate(row.id)}
            >
              <Check className="h-4 w-4" />
            </Button>,
          );
        }

        if (canManage) {
          items.push(
            <Button
              key="edit"
              variant="ghost"
              size="icon"
              aria-label="Edit announcement"
              onClick={() => setEditing(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>,
            <Button
              key="delete"
              variant="ghost"
              size="icon"
              aria-label="Delete announcement"
              onClick={() => setDeleting(row)}
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>,
          );
        }

        if (items.length === 0) return <span className="text-xs text-slate-400">View only</span>;
        return <div className="flex justify-end gap-1">{items}</div>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Publish company-wide news, policy updates and targeted notices."
        actions={
          <div className="flex items-center gap-2">
            {canRead ? <Badge tone="info">{unread.data ?? 0} unread</Badge> : null}
            {canManage ? (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                New announcement
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <Select
            label="Audience"
            value={audience}
            onChange={(event) => {
              setAudience(event.target.value);
              setPage(1);
            }}
            options={AUDIENCE_OPTIONS}
          />
        </div>

        <DataTable
          columns={columns}
          rows={announcements.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={announcements.isPending}
          isFetching={announcements.isFetching}
          error={announcements.error}
          onRetry={() => void announcements.refetch()}
          emptyTitle="No announcements"
          emptyDescription="Publish an announcement to get started."
        />

        <Pagination meta={announcements.data?.meta} onPageChange={setPage} />
      </Card>

      {creating ? (
        <AnnouncementDialog
          onClose={() => setCreating(false)}
          onSubmit={(payload) => createAnnouncement(payload)}
          onSaved={() => {
            toast.success('Announcement published');
            setCreating(false);
            invalidate();
          }}
        />
      ) : null}

      {editing ? (
        <AnnouncementDialog
          announcement={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => updateAnnouncement(editing.id, payload)}
          onSaved={() => {
            toast.success('Announcement updated');
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open
          title="Delete announcement"
          message={`Delete "${deleting.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}

function AnnouncementDialog({
  announcement,
  onClose,
  onSubmit,
  onSaved,
}: {
  announcement?: Announcement;
  onClose: () => void;
  onSubmit: (payload: AnnouncementPayload) => Promise<unknown>;
  onSaved: () => void;
}) {
  const isNew = announcement === undefined;

  const [title, setTitle] = useState(announcement?.title ?? '');
  const [content, setContent] = useState(announcement?.content ?? '');
  const [audience, setAudience] = useState<AnnouncementAudience>(announcement?.audience ?? 'ALL');
  const [departmentId, setDepartmentId] = useState(announcement?.departmentId ?? '');
  const [designationId, setDesignationId] = useState(announcement?.designationId ?? '');
  const [targetRole, setTargetRole] = useState<Role | ''>(announcement?.role ?? '');
  const [employeeId, setEmployeeId] = useState(announcement?.employeeId ?? '');
  const [isPinned, setIsPinned] = useState(announcement?.isPinned ?? false);
  const [publishedAt, setPublishedAt] = useState(toLocalInput(announcement?.publishedAt));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(announcement?.expiresAt));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const departments = useQuery({
    queryKey: ['organization', 'departments', 'picker'],
    enabled: audience === 'DEPARTMENT',
    queryFn: () => listDepartments({ limit: 100 }),
  });
  const designations = useQuery({
    queryKey: ['organization', 'designations', 'picker'],
    enabled: audience === 'DESIGNATION',
    queryFn: () => listDesignations({ limit: 100 }),
  });
  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    enabled: audience === 'EMPLOYEE',
    queryFn: () => listEmployees({ limit: 100, sortOrder: 'asc' }),
  });

  const targetMissing =
    (audience === 'DEPARTMENT' && !departmentId) ||
    (audience === 'DESIGNATION' && !designationId) ||
    (audience === 'ROLE' && !targetRole) ||
    (audience === 'EMPLOYEE' && !employeeId);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const payload: AnnouncementPayload = {
        title: title.trim(),
        content: content.trim(),
        audience,
        departmentId: audience === 'DEPARTMENT' ? departmentId : null,
        designationId: audience === 'DESIGNATION' ? designationId : null,
        role: audience === 'ROLE' ? targetRole || null : null,
        employeeId: audience === 'EMPLOYEE' ? employeeId : null,
        isPinned,
        ...(publishedAt ? { publishedAt: new Date(publishedAt).toISOString() } : {}),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
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
      title={isNew ? 'New announcement' : 'Edit announcement'}
      description="Leave publish time empty to publish now. Set an expiry to unpublish automatically."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={!title.trim() || !content.trim() || targetMissing}
            onClick={() => void submit()}
          >
            {isNew ? 'Publish' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Textarea
          label="Content"
          rows={5}
          value={content}
          placeholder="What do you want everyone to know?"
          onChange={(event) => setContent(event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Audience"
            value={audience}
            onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
            options={ANNOUNCEMENT_AUDIENCES}
          />

          {audience === 'DEPARTMENT' ? (
            <Select
              label="Department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              placeholder="Select a department"
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            />
          ) : null}

          {audience === 'DESIGNATION' ? (
            <Select
              label="Designation"
              value={designationId}
              onChange={(event) => setDesignationId(event.target.value)}
              placeholder="Select a designation"
              options={(designations.data?.items ?? []).map((designation) => ({
                value: designation.id,
                label: designation.name,
              }))}
            />
          ) : null}

          {audience === 'ROLE' ? (
            <Select
              label="Role"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value as Role | '')}
              placeholder="Select a role"
              options={ANNOUNCEMENT_ROLES}
            />
          ) : null}

          {audience === 'EMPLOYEE' ? (
            <Select
              label="Employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              placeholder="Select an employee"
              options={(employees.data?.items ?? []).map((employee) => ({
                value: employee.id,
                label: fullName(employee),
              }))}
            />
          ) : null}

          <Input
            label="Publish at"
            type="datetime-local"
            value={publishedAt}
            onChange={(event) => setPublishedAt(event.target.value)}
          />
          <Input
            label="Expires at"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(event) => setIsPinned(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Pin to the top of the list
        </label>
      </div>
    </Modal>
  );
}
