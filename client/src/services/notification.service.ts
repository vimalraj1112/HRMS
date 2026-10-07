import { api, cleanQuery } from '@/lib/api';
import type { ApiMeta, ApiSuccess } from '@/types/api';

export interface Page<T> {
  items: T[];
  meta: ApiMeta;
}

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface AppNotification {
  id: string;
  userId: string;
  employeeId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends Page<AppNotification> {
  unreadCount: number;
}

export async function listNotifications(query: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
} = {}): Promise<NotificationPage> {
  const response = await api.get<ApiSuccess<AppNotification[]>>('/notifications', { params: cleanQuery(query) });
  const meta = response.data.meta as ApiMeta & { unreadCount?: number };

  return {
    items: response.data.data,
    meta,
    unreadCount: meta.unreadCount ?? 0,
  };
}

export async function unreadNotificationCount(): Promise<number> {
  const response = await api.get<ApiSuccess<{ unreadCount: number }>>('/notifications/unread-count');
  return response.data.data.unreadCount;
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const response = await api.patch<ApiSuccess<AppNotification>>(`/notifications/${id}/read`);
  return response.data.data;
}

export async function markNotificationUnread(id: string): Promise<AppNotification> {
  const response = await api.patch<ApiSuccess<AppNotification>>(`/notifications/${id}/unread`);
  return response.data.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await api.post<ApiSuccess<{ updated: number }>>('/notifications/read-all');
  return response.data.data.updated;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditFacet {
  value: string;
  count: number;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  from?: string;
  to?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function listAuditLogs(query: AuditLogQuery = {}) {
  const response = await api.get<ApiSuccess<AuditLogEntry[]>>('/audit-logs', { params: cleanQuery(query) });
  const meta = response.data.meta as Page<AuditLogEntry>['meta'] & {
    facets?: { actions: AuditFacet[]; entities: AuditFacet[] };
  };

  return { items: response.data.data, meta, facets: meta.facets ?? { actions: [], entities: [] } };
}

export async function getAuditLog(id: string): Promise<AuditLogEntry> {
  const response = await api.get<ApiSuccess<AuditLogEntry>>(`/audit-logs/${id}`);
  return response.data.data;
}