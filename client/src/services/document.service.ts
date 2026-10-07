import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { EmployeeDocument, DocumentListQuery, UploadDocumentPayload } from '@/types/document';
import type { Page } from './employee.service';

const DOCUMENTS_PATH = '/documents';

export async function listDocuments(query: DocumentListQuery = {}): Promise<Page<EmployeeDocument>> {
  const response = await api.get<ApiSuccess<EmployeeDocument[]>>(DOCUMENTS_PATH, {
    params: cleanQuery(query),
  });
  return { items: response.data.data, meta: response.data.meta as Page<EmployeeDocument>['meta'] };
}

export async function getDocument(id: string): Promise<EmployeeDocument> {
  const response = await api.get<ApiSuccess<EmployeeDocument>>(`${DOCUMENTS_PATH}/${id}`);
  return response.data.data;
}

export async function uploadDocument(payload: UploadDocumentPayload): Promise<EmployeeDocument> {
  const body = new FormData();
  body.append('type', payload.type);
  body.append('title', payload.title);
  if (payload.employeeId) body.append('employeeId', payload.employeeId);
  if (payload.expiresAt) body.append('expiresAt', payload.expiresAt);
  body.append('file', payload.file);

  const response = await api.post<ApiSuccess<EmployeeDocument>>(DOCUMENTS_PATH, body, {
    // The default JSON header would stop the browser adding its boundary.
    headers: { 'Content-Type': undefined },
  });
  return response.data.data;
}

export async function verifyDocument(
  id: string,
  payload: { isVerified: boolean; remark?: string },
): Promise<EmployeeDocument> {
  const response = await api.patch<ApiSuccess<EmployeeDocument>>(`${DOCUMENTS_PATH}/${id}/verify`, payload);
  return response.data.data;
}

export async function deleteDocument(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`${DOCUMENTS_PATH}/${id}`);
  return response.data.data;
}

/**
 * Fetches the stored bytes and hands them to the browser. The server records a
 * download audit entry either way, so the payload must be read as a blob.
 */
export async function downloadDocument(document: EmployeeDocument): Promise<void> {
  const response = await api.get<Blob>(`${DOCUMENTS_PATH}/${document.id}/download`, {
    responseType: 'blob',
  });

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = document.fileName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}