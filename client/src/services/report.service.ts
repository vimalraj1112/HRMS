import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { ReportPayload, ReportRequest } from '@/types/report';

export async function getReport(request: ReportRequest): Promise<ReportPayload> {
  const path = request.report === 'payroll' ? '/reports/payroll' : `/reports/${request.report}`;
  const response = await api.get<ApiSuccess<ReportPayload>>(path, {
    params: cleanQuery({ from: request.from, to: request.to, month: request.month, year: request.year }),
  });
  return response.data.data;
}

function filenameFrom(disposition: unknown, request: ReportRequest): string {
  const header = typeof disposition === 'string' ? disposition : '';
  const match = /filename="([^"]+)"/.exec(header);
  if (match?.[1]) return match[1];
  return `${request.report}.csv`;
}

/** The server answers with a CSV attachment, so the blob is handed to the browser. */
export async function exportReportCsv(request: ReportRequest): Promise<void> {
  const response = await api.get<Blob>('/reports/export', {
    params: cleanQuery({ ...request, format: 'csv' }),
    responseType: 'blob',
  });

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filenameFrom(response.headers['content-disposition'], request);
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
