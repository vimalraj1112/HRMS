import type { CandidateStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { addUtcDays, toDateInputValue, todayUtc } from '../../utils/workdays';
import type { Actor } from '../leave/leave.service';

const EXPIRING_SOON_DAYS = 30;
const LATEST_ANNOUNCEMENTS = 5;

const PIPELINE_STATUSES: CandidateStatus[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'SELECTED', 'OFFERED'];

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value === null || value === undefined ? 0 : value.toNumber();

interface AttendanceCounts {
  present: number;
  absent: number;
  onLeave: number;
  late: number;
}

function emptyAttendance(date: string): AttendanceCounts & { total: number; date: string } {
  return { present: 0, absent: 0, onLeave: 0, late: 0, total: 0, date };
}

/** HALF_DAY still means the person showed up; LATE is tracked on its own. */
function tallyAttendance(counts: AttendanceCounts, statuses: string[]): void {
  for (const status of statuses) {
    if (status === 'PRESENT' || status === 'HALF_DAY') counts.present += 1;
    else if (status === 'ABSENT') counts.absent += 1;
    else if (status === 'ON_LEAVE') counts.onLeave += 1;
    else if (status === 'LATE') counts.late += 1;
  }
}

interface PayrollRunBlock {
  status: string;
  month: number;
  year: number;
  totalNetSalary: number;
  employeeCount: number;
}

interface PayslipBlock {
  status: string;
  month: number;
  year: number;
  netSalary: number;
}

type PayrollBlock = PayrollRunBlock | PayslipBlock;

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  audience: string;
  isPinned: boolean;
  publishedAt: Date;
  isRead: boolean;
}

/**
 * Announcements are only surfaced when the audience can actually see them:
 * everyone gets ALL posts, plus the ones aimed at their role, their own record,
 * their department or their designation.
 */
function announcementWhere(actor: Actor, own: { departmentId: string | null; designationId: string | null } | null) {
  const now = new Date();
  const audience: Prisma.AnnouncementWhereInput[] = [{ audience: 'ALL' }, { audience: 'ROLE', role: actor.role as never }];

  if (actor.employeeId) audience.push({ audience: 'EMPLOYEE', employeeId: actor.employeeId });
  if (own?.departmentId) audience.push({ audience: 'DEPARTMENT', departmentId: own.departmentId });
  if (own?.designationId) audience.push({ audience: 'DESIGNATION', designationId: own.designationId });

  return {
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    AND: [{ OR: audience }],
  } satisfies Prisma.AnnouncementWhereInput;
}

export async function getDashboard(actor: Actor, scope: EmployeeScope) {
  const isSelf = scope.mode === 'self';
  const now = new Date();
  const today = todayUtc();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const expiringCutoff = addUtcDays(today, EXPIRING_SOON_DAYS);
  const employeeIds = scope.employeeIds ?? [];

  const canReadOrgPayroll =
    hasPermission(actor.role, PERMISSIONS.PAYROLL_READ) || hasPermission(actor.role, PERMISSIONS.PAYSLIP_READ_ANY);
  const useRunPayroll = canReadOrgPayroll && !isSelf;
  const showRecruitment =
    !isSelf &&
    (hasPermission(actor.role, PERMISSIONS.JOB_MANAGE) || hasPermission(actor.role, PERMISSIONS.CANDIDATE_MANAGE));

  const [own, employees, attendanceRows, leaveRows, documentRows, payrollRun, payslip] = await Promise.all([
    actor.employeeId
      ? prisma.employee.findUnique({
          where: { id: actor.employeeId },
          select: { id: true, status: true, joiningDate: true, departmentId: true, designationId: true },
        })
      : Promise.resolve(null),
    isSelf
      ? Promise.resolve(null)
      : prisma.employee.findMany({ select: { status: true, joiningDate: true } }),
    prisma.attendance.findMany({
      where: { date: today, ...(isSelf ? { employeeId: { in: employeeIds } } : {}) },
      select: { status: true },
    }),
    prisma.leaveRequest.findMany({
      where: isSelf ? { employeeId: { in: employeeIds } } : {},
      select: { status: true, appliedAt: true, endDate: true },
    }),
    prisma.employeeDocument.findMany({
      where: { ...(isSelf ? { employeeId: { in: employeeIds } } : {}), deletedAt: null },
      select: { isVerified: true, expiresAt: true },
    }),
    useRunPayroll
      ? prisma.payrollRun.findFirst({
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          select: { status: true, month: true, year: true, totalNetSalary: true, employeeCount: true },
        })
      : Promise.resolve(null),
    !useRunPayroll && actor.employeeId
      ? prisma.payslip.findFirst({
          where: { employeeId: actor.employeeId },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          select: { status: true, month: true, year: true, netSalary: true },
        })
      : Promise.resolve(null),
  ]);

  const monthStartUtc = monthStart.getTime();
  const activeEmployees = employees?.filter((employee) => employee.status === 'ACTIVE').length ?? 0;

  const headcount = isSelf
    ? {
        total: own ? 1 : 0,
        active: own && own.status === 'ACTIVE' ? 1 : 0,
        newThisMonth: own && own.joiningDate.getTime() >= monthStartUtc ? 1 : 0,
      }
    : {
        total: employees?.length ?? 0,
        active: activeEmployees,
        newThisMonth:
          employees?.filter((employee) => employee.joiningDate.getTime() >= monthStartUtc).length ?? 0,
      };

  const attendance = emptyAttendance(toDateInputValue(today));
  attendance.total = isSelf ? (own ? 1 : 0) : activeEmployees;
  tallyAttendance(
    attendance,
    attendanceRows.map((row) => row.status),
  );

  const leave = {
    pendingApprovals: leaveRows.filter((row) => row.status === 'PENDING').length,
    approvedThisMonth: leaveRows.filter(
      (row) => row.status === 'APPROVED' && row.appliedAt.getTime() >= monthStartUtc,
    ).length,
    upcoming: leaveRows.filter((row) => row.status === 'APPROVED' && row.endDate.getTime() >= today.getTime()).length,
  };

  const documents = {
    pendingVerification: documentRows.filter((row) => !row.isVerified).length,
    expiringSoon: documentRows.filter(
      (row) => row.expiresAt !== null && row.expiresAt.getTime() <= expiringCutoff.getTime(),
    ).length,
  };

  let payroll: PayrollBlock | null = null;
  if (useRunPayroll && payrollRun) {
    payroll = {
      status: payrollRun.status,
      month: payrollRun.month,
      year: payrollRun.year,
      totalNetSalary: toNumber(payrollRun.totalNetSalary),
      employeeCount: payrollRun.employeeCount,
    };
  } else if (!useRunPayroll && payslip) {
    payroll = {
      status: payslip.status,
      month: payslip.month,
      year: payslip.year,
      netSalary: toNumber(payslip.netSalary),
    };
  }

  const where = announcementWhere(actor, own);

  const [latestRows, unread, openJobs, candidatesInPipeline, interviewsThisWeek, offersExtended] =
    await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        take: LATEST_ANNOUNCEMENTS,
        select: {
          id: true,
          title: true,
          content: true,
          audience: true,
          isPinned: true,
          publishedAt: true,
          reads: { where: { userId: actor.id }, select: { id: true }, take: 1 },
        },
      }),
      prisma.announcement.count({ where: { AND: [where, { reads: { none: { userId: actor.id } } }] } }),
      showRecruitment ? prisma.jobOpening.count({ where: { status: 'OPEN' } }) : Promise.resolve(0),
      showRecruitment ? prisma.candidate.count({ where: { status: { in: PIPELINE_STATUSES } } }) : Promise.resolve(0),
      showRecruitment
        ? prisma.interview.count({
            where: {
              status: 'SCHEDULED',
              scheduledAt: { gte: today, lte: new Date(addUtcDays(today, 7).getTime() + 86_399_999) },
            },
          })
        : Promise.resolve(0),
      showRecruitment ? prisma.offer.count({ where: { status: 'EXTENDED' } }) : Promise.resolve(0),
    ]);

  const announcements: AnnouncementRow[] = latestRows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    audience: row.audience,
    isPinned: row.isPinned,
    publishedAt: row.publishedAt,
    isRead: row.reads.length > 0,
  }));

  return {
    headcount,
    attendance,
    leave,
    documents,
    payroll,
    announcements: { unread, latest: announcements },
    recruitment: { openJobs, candidatesInPipeline, interviewsThisWeek, offersExtended },
  };
}
