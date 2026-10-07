export type ReportType = 'overview' | 'headcount' | 'attendance' | 'leave' | 'payroll';

export type ReportRow = Record<string, string | number>;

export interface ReportPayload {
  report: ReportType;
  range?: { from: string; to: string };
  period?: { month: number; year: number };
  summary: Record<string, number>;
  rows: ReportRow[];
}

export interface ReportRequest {
  report: ReportType;
  from?: string;
  to?: string;
  month?: number;
  year?: number;
}
