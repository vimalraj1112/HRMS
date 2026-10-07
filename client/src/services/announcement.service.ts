import { api, cleanQuery } from '@/lib/api';
import type { ApiMeta, ApiSuccess } from '@/types/api';
import type {
  Announcement,
  AnnouncementListQuery,
  AnnouncementPatch,
  AnnouncementPayload,
} from '@/types/announcement';
import type { Page } from './employee.service';

export async function listAnnouncements(query: AnnouncementListQuery = {}): Promise<Page<Announcement>> {
  const response = await api.get<ApiSuccess<Announcement[]>>('/announcements', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  const response = await api.get<ApiSuccess<Announcement>>(`/announcements/${id}`);
  return response.data.data;
}

export async function createAnnouncement(payload: AnnouncementPayload): Promise<Announcement> {
  const response = await api.post<ApiSuccess<Announcement>>('/announcements', payload);
  return response.data.data;
}

export async function updateAnnouncement(id: string, payload: AnnouncementPatch): Promise<Announcement> {
  const response = await api.patch<ApiSuccess<Announcement>>(`/announcements/${id}`, payload);
  return response.data.data;
}

export async function deleteAnnouncement(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/announcements/${id}`);
  return response.data.data;
}

export async function markAnnouncementRead(id: string): Promise<{ id: string; readAt: string }> {
  const response = await api.post<ApiSuccess<{ id: string; readAt: string }>>(`/announcements/${id}/read`);
  return response.data.data;
}

export async function unreadAnnouncementCount(): Promise<number> {
  const response = await api.get<ApiSuccess<{ unreadCount: number }>>('/announcements/unread-count');
  return response.data.data.unreadCount;
}
