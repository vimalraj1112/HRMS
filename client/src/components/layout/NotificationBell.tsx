import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { toMessage } from '@/lib/api';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  type AppNotification,
} from '@/services/notification.service';
import { cn } from '@/lib/utils';

const TONE: Record<AppNotification['type'], string> = {
  INFO: 'bg-brand-500',
  SUCCESS: 'bg-emerald-500',
  WARNING: 'bg-amber-500',
  ERROR: 'bg-rose-500',
};

export function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: unreadNotificationCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => listNotifications({ limit: 8 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (notification) => {
      invalidate();
      if (notification.link) {
        setOpen(false);
        void navigate(notification.link);
      }
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (updated) => {
      toast.success(`${updated} notification(s) marked as read`);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const count = unread.data ?? 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              isLoading={markAll.isPending}
              disabled={count === 0}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          </div>

          {list.isPending ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Loading notifications...</p>
          ) : list.isError ? (
            <p className="px-4 py-6 text-center text-sm text-rose-600">{toMessage(list.error)}</p>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {(list.data?.items ?? []).map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => markRead.mutate(notification.id)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                      !notification.isRead && 'bg-brand-50/40',
                    )}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[notification.type])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{notification.title}</span>
                        {!notification.isRead ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{notification.message}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}