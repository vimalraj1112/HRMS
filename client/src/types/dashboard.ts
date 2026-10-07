export interface DashboardHeadcount {
  total: number;
  active: number;
  newThisMonth: number;
}

export interface DashboardAttendance {
  date: string;
  present: number;
  absent: number;
  onLeave: number;
  late: number;
  total: number;
}

export interface DashboardLeave {
  pendingApprovals: number;
  approvedThisMonth: number;
  upcoming: number;
}

export interface DashboardDocuments {
  pendingVerification: number;
  expiringSoon: number;
}

export type DashboardPayroll =
  | { status: string; month: number; year: number; totalNetSalary: number; employeeCount: number }
  | { status: string; month: number; year: number; netSalary: number }
  | null;

export interface DashboardAnnouncement {
  id: string;
  title: string;
  content: string;
  audience: string;
  isPinned: boolean;
  publishedAt: string;
  isRead: boolean;
}

export interface DashboardRecruitment {
  openJobs: number;
  candidatesInPipeline: number;
  interviewsThisWeek: number;
  offersExtended: number;
}

export interface DashboardPayload {
  headcount: DashboardHeadcount;
  attendance: DashboardAttendance;
  leave: DashboardLeave;
  documents: DashboardDocuments;
  payroll: DashboardPayroll;
  announcements: { unread: number; latest: DashboardAnnouncement[] };
  recruitment: DashboardRecruitment;
}
