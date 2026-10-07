import { AuditAction, PayrollStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hasPermission, PERMISSIONS } from '../../config/rbac';
import type { EmployeeScope } from '../../middleware/rbac.middleware';
import { assertEmployeeAccess } from '../../middleware/rbac.middleware';
import { recordAudit, type RequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { eachUtcDay, isWeekend, toDateInputValue, toUtcDate } from '../../utils/workdays';
import { notifyEmployee } from '../notifications/notifications.service';
import type { Actor } from '../leave/leave.service';
import type {
  CreateSalaryStructureBody,
  ListPayrollRunsQuery,
  ListPayslipsQuery,
  ListSalaryStructuresQuery,
  ProcessPayrollBody,
  UpdateSalaryStructureBody,
} from './payroll.validator';

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value === null || value === undefined ? 0 : value.toNumber();

const round2 = (value: number): number => Math.round(value * 100) / 100;

const EMPLOYEE_BRIEF = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, name: true } },
} as const;

const SALARY_SELECT = {
  id: true,
  employeeId: true,
  effectiveFrom: true,
  effectiveTo: true,
  basicSalary: true,
  hra: true,
  transportAllowance: true,
  medicalAllowance: true,
  otherAllowance: true,
  grossSalary: true,
  pf: true,
  esi: true,
  professionalTax: true,
  tds: true,
  otherDeduction: true,
  netSalary: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: EMPLOYEE_BRIEF },
} as const;

const MONEY_FIELDS = [
  'basicSalary',
  'hra',
  'transportAllowance',
  'medicalAllowance',
  'otherAllowance',
  'grossSalary',
  'pf',
  'esi',
  'professionalTax',
  'tds',
  'otherDeduction',
  'netSalary',
] as const;

type SalaryRecord = Record<(typeof MONEY_FIELDS)[number], Prisma.Decimal>;

/** Components a structure stores directly, excluding the derived gross and net. */
const STRUCTURE_AMOUNT_KEYS = [
  'basicSalary',
  'hra',
  'transportAllowance',
  'medicalAllowance',
  'otherAllowance',
  'pf',
  'esi',
  'professionalTax',
  'tds',
  'otherDeduction',
] as const satisfies readonly (keyof SalaryRecord)[];

function serializeSalary<T extends SalaryRecord>(structure: T) {
  const result: Record<string, unknown> = { ...structure };
  for (const field of MONEY_FIELDS) result[field] = toNumber(structure[field]);
  return result as Omit<T, (typeof MONEY_FIELDS)[number]> & Record<(typeof MONEY_FIELDS)[number], number>;
}

/** Gross is the sum of the earning components; net is gross minus every deduction. */
function computeTotals(input: {
  basicSalary: number;
  hra: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowance: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  otherDeduction: number;
}) {
  const grossSalary = round2(
    input.basicSalary + input.hra + input.transportAllowance + input.medicalAllowance + input.otherAllowance,
  );
  const totalDeductions = round2(input.pf + input.esi + input.professionalTax + input.tds + input.otherDeduction);

  return { grossSalary, totalDeductions, netSalary: round2(grossSalary - totalDeductions) };
}

function assertCanReadSalary(scope: EmployeeScope, actor: Actor, employeeId: string): void {
  if (actor.employeeId === employeeId && hasPermission(actor.role, PERMISSIONS.SALARY_READ_OWN)) return;
  assertEmployeeAccess(scope, employeeId);
}

export async function listSalaryStructures(query: ListSalaryStructuresQuery, scope: EmployeeScope) {
  const where: Prisma.SalaryStructureWhereInput = {
    ...(scope.mode === 'all' ? {} : { employeeId: { in: scope.employeeIds ?? [] } }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
  };

  const [items, total] = await Promise.all([
    prisma.salaryStructure.findMany({
      where,
      select: SALARY_SELECT,
      orderBy: [{ employee: { employeeCode: query.sortOrder } }, { effectiveFrom: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.salaryStructure.count({ where }),
  ]);

  return { items: items.map(serializeSalary), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getSalaryStructure(id: string, scope: EmployeeScope) {
  const structure = await prisma.salaryStructure.findUnique({ where: { id }, select: SALARY_SELECT });
  if (!structure) throw ApiError.notFound('Salary structure not found');

  assertEmployeeAccess(scope, structure.employeeId);
  return serializeSalary(structure);
}

export async function createSalaryStructure(body: CreateSalaryStructureBody, actor: Actor, meta: RequestMeta) {
  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: { id: true, status: true },
  });
  if (!employee) throw ApiError.notFound('Employee record not found');
  if (employee.status === 'TERMINATED') {
    throw ApiError.unprocessable('A salary structure cannot be created for a terminated employee');
  }

  const effectiveFrom = toUtcDate(body.effectiveFrom);
  const totals = computeTotals(body);
  if (totals.netSalary < 0) {
    throw ApiError.unprocessable('Total deductions cannot exceed the gross salary');
  }

  const clash = await prisma.salaryStructure.findFirst({
    where: { employeeId: body.employeeId, effectiveFrom },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('A salary structure already starts on that date');

  const previous = await prisma.salaryStructure.findFirst({
    where: { employeeId: body.employeeId, effectiveTo: null, isActive: true },
    select: { id: true, effectiveFrom: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  const created = await prisma.$transaction(async (tx) => {
    if (previous && previous.effectiveFrom >= effectiveFrom) {
      throw ApiError.unprocessable('The new structure must start after the current one');
    }

    if (previous) {
      const dayBefore = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
      await tx.salaryStructure.update({ where: { id: previous.id }, data: { effectiveTo: dayBefore } });
    }

    return tx.salaryStructure.create({
      data: {
        employeeId: body.employeeId,
        effectiveFrom,
        basicSalary: body.basicSalary,
        hra: body.hra,
        transportAllowance: body.transportAllowance,
        medicalAllowance: body.medicalAllowance,
        otherAllowance: body.otherAllowance,
        grossSalary: totals.grossSalary,
        pf: body.pf,
        esi: body.esi,
        professionalTax: body.professionalTax,
        tds: body.tds,
        otherDeduction: body.otherDeduction,
        netSalary: totals.netSalary,
        isActive: body.isActive,
        createdById: actor.id,
      },
      select: SALARY_SELECT,
    });
  });

  // Salary figures stay out of the audit payload; the structure itself holds them.
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.SALARY_CREATE,
    entity: 'SalaryStructure',
    entityId: created.id,
    meta,
    newValue: {
      employeeId: created.employeeId,
      effectiveFrom: body.effectiveFrom,
      isActive: created.isActive,
    },
  });

  return serializeSalary(created);
}

export async function updateSalaryStructure(
  id: string,
  body: UpdateSalaryStructureBody,
  actor: Actor,
  meta: RequestMeta,
) {
  const existing = await prisma.salaryStructure.findUnique({ where: { id }, select: SALARY_SELECT });
  if (!existing) throw ApiError.notFound('Salary structure not found');

  const employeeId = body.employeeId ?? existing.employeeId;
  if (employeeId !== existing.employeeId) {
    throw ApiError.unprocessable('A salary structure cannot be moved to another employee');
  }

  const merged = {
    basicSalary: body.basicSalary ?? toNumber(existing.basicSalary),
    hra: body.hra ?? toNumber(existing.hra),
    transportAllowance: body.transportAllowance ?? toNumber(existing.transportAllowance),
    medicalAllowance: body.medicalAllowance ?? toNumber(existing.medicalAllowance),
    otherAllowance: body.otherAllowance ?? toNumber(existing.otherAllowance),
    pf: body.pf ?? toNumber(existing.pf),
    esi: body.esi ?? toNumber(existing.esi),
    professionalTax: body.professionalTax ?? toNumber(existing.professionalTax),
    tds: body.tds ?? toNumber(existing.tds),
    otherDeduction: body.otherDeduction ?? toNumber(existing.otherDeduction),
  };

  const totals = computeTotals(merged);
  if (totals.netSalary < 0) {
    throw ApiError.unprocessable('Total deductions cannot exceed the gross salary');
  }

  const updated = await prisma.salaryStructure.update({
    where: { id },
    data: {
      ...(body.effectiveFrom !== undefined ? { effectiveFrom: toUtcDate(body.effectiveFrom) } : {}),
      basicSalary: merged.basicSalary,
      hra: merged.hra,
      transportAllowance: merged.transportAllowance,
      medicalAllowance: merged.medicalAllowance,
      otherAllowance: merged.otherAllowance,
      grossSalary: totals.grossSalary,
      pf: merged.pf,
      esi: merged.esi,
      professionalTax: merged.professionalTax,
      tds: merged.tds,
      otherDeduction: merged.otherDeduction,
      netSalary: totals.netSalary,
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    select: SALARY_SELECT,
  });

  // Which components moved is recorded; the figures themselves are not.
  const changedComponents = STRUCTURE_AMOUNT_KEYS.filter((key) => toNumber(existing[key]) !== merged[key]);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.SALARY_UPDATE,
    entity: 'SalaryStructure',
    entityId: id,
    meta,
    oldValue: {
      effectiveFrom: toDateInputValue(existing.effectiveFrom),
      isActive: existing.isActive,
    },
    newValue: {
      effectiveFrom: toDateInputValue(updated.effectiveFrom),
      isActive: updated.isActive,
      ...(changedComponents.length > 0 ? { changedComponents } : {}),
    },
  });

  return serializeSalary(updated);
}

export async function deleteSalaryStructure(id: string, actor: Actor, meta: RequestMeta) {
  const existing = await prisma.salaryStructure.findUnique({
    where: { id },
    select: { id: true, employeeId: true, effectiveFrom: true, effectiveTo: true },
  });
  if (!existing) throw ApiError.notFound('Salary structure not found');

  const hasTakenEffect = existing.effectiveFrom.getTime() <= Date.now();
  const hasGeneratedPayslips =
    (await prisma.payslip.count({
      where: {
        employeeId: existing.employeeId,
        month: existing.effectiveFrom.getUTCMonth() + 1,
        year: existing.effectiveFrom.getUTCFullYear(),
      },
    })) > 0;

  if (hasTakenEffect || hasGeneratedPayslips) {
    throw ApiError.conflict('This salary structure has already taken effect and can only be deactivated');
  }

  await prisma.salaryStructure.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.SALARY_UPDATE,
    entity: 'SalaryStructure',
    entityId: id,
    meta,
    oldValue: { employeeId: existing.employeeId, effectiveFrom: existing.effectiveFrom },
  });

  return { id };
}

export async function listPayrollRuns(query: ListPayrollRunsQuery) {
  const where: Prisma.PayrollRunWhereInput = {
    ...(query.year ? { year: query.year } : {}),
    ...(query.month ? { month: query.month } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        employeeCount: true,
        totalGrossSalary: true,
        totalDeductions: true,
        totalNetSalary: true,
        processedAt: true,
        lockedAt: true,
        notes: true,
        createdAt: true,
        processedBy: { select: { email: true } },
      },
      orderBy: [{ year: query.sortOrder }, { month: query.sortOrder }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.payrollRun.count({ where }),
  ]);

  return {
    items: items.map((run) => ({
      ...run,
      totalGrossSalary: toNumber(run.totalGrossSalary),
      totalDeductions: toNumber(run.totalDeductions),
      totalNetSalary: toNumber(run.totalNetSalary),
    })),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

interface AttendanceSummary {
  present: number;
  absent: number;
  paidLeave: number;
  workingDays: number;
}

/**
 * Attendance drives loss of pay: weekends and holidays are not working days, approved
 * leave is paid, and anything else without a record counts as absent.
 */
async function attendanceSummaryFor(
  employeeId: string,
  year: number,
  month: number,
  holidayDates: ReadonlySet<string>,
): Promise<AttendanceSummary> {
  const { start, end } = monthBounds(year, month);
  const records = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lte: end } },
    select: { date: true, status: true },
  });

  const byDate = new Map(records.map((record) => [record.date.toISOString().slice(0, 10), record.status]));
  let workingDays = 0;
  let present = 0;
  let paidLeave = 0;
  let absent = 0;

  for (const day of eachUtcDay(start, end)) {
    const key = day.toISOString().slice(0, 10);
    if (isWeekend(day) || holidayDates.has(key)) continue;

    workingDays += 1;
    const status = byDate.get(key);
    if (!status || status === 'ABSENT') absent += 1;
    else if (status === 'ON_LEAVE') paidLeave += 1;
    else present += 1;
  }

  return { present, absent, paidLeave, workingDays };
}

/**
 * Approval rules:
 * - The employee must have an active salary structure covering the period.
 * - Only one open-ended structure per employee; a new one closes the previous.
 * - An employee is skipped when they joined after the month ended or left before it began.
 */
export async function processPayroll(body: ProcessPayrollBody, actor: Actor, meta: RequestMeta) {
  const { year, month } = body;
  const { start, end } = monthBounds(year, month);

  if (end.getTime() > Date.now()) {
    throw ApiError.unprocessable('Payroll can only be processed for a month that has already finished');
  }

  const existingRun = await prisma.payrollRun.findFirst({ where: { year, month }, select: { id: true, status: true } });
  if (existingRun && existingRun.status !== PayrollStatus.DRAFT) {
    throw ApiError.conflict(`Payroll for ${year}-${String(month).padStart(2, '0')} has already been ${existingRun.status.toLowerCase()}`);
  }

  const employees = await prisma.employee.findMany({
    where: { status: { not: 'TERMINATED' } },
    select: { id: true, joiningDate: true, exitDate: true },
  });

  const holidays = await prisma.holiday.findMany({
    where: { isActive: true, date: { gte: start, lte: end } },
    select: { date: true },
  });
  const holidayDates = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));

  const salaryRows = await prisma.salaryStructure.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    select: {
      id: true,
      employeeId: true,
      basicSalary: true,
      hra: true,
      transportAllowance: true,
      medicalAllowance: true,
      otherAllowance: true,
      pf: true,
      esi: true,
      professionalTax: true,
      tds: true,
      otherDeduction: true,
    },
  });

  const structureByEmployee = new Map<string, (typeof salaryRows)[number]>();
  for (const row of salaryRows) {
    if (!structureByEmployee.has(row.employeeId)) structureByEmployee.set(row.employeeId, row);
  }

  const missing: string[] = [];
  const drafts: Array<{
    employeeId: string;
    month: number;
    year: number;
    basicSalary: number;
    hra: number;
    transportAllowance: number;
    medicalAllowance: number;
    otherAllowance: number;
    grossSalary: number;
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    otherDeduction: number;
    totalDeductions: number;
    netSalary: number;
    workingDays: number;
    daysPresent: number;
    daysAbsent: number;
    daysPaidLeave: number;
    lopDays: number;
  }> = [];

  for (const employee of employees) {
    const structure = structureByEmployee.get(employee.id);
    if (!structure) {
      missing.push(employee.id);
      continue;
    }

    if (employee.joiningDate > end) continue;
    if (employee.exitDate && employee.exitDate < start) continue;

    const attendance = await attendanceSummaryFor(employee.id, year, month, holidayDates);
    const grossSalary = round2(
      toNumber(structure.basicSalary) +
        toNumber(structure.hra) +
        toNumber(structure.transportAllowance) +
        toNumber(structure.medicalAllowance) +
        toNumber(structure.otherAllowance),
    );

    // Unpaid days are paid at the monthly daily rate.
    const lopDays = attendance.absent;
    const dailyRate = attendance.workingDays > 0 ? grossSalary / attendance.workingDays : grossSalary;
    const lopAmount = round2(dailyRate * lopDays);
    const paidGross = round2(Math.max(0, grossSalary - lopAmount));

    const pf = round2(toNumber(structure.pf));
    const esi = round2(toNumber(structure.esi));
    const professionalTax = round2(toNumber(structure.professionalTax));
    const tds = round2(toNumber(structure.tds));
    const otherDeduction = round2(toNumber(structure.otherDeduction));
    const totalDeductions = round2(pf + esi + professionalTax + tds + otherDeduction);

    drafts.push({
      employeeId: employee.id,
      month,
      year,
      basicSalary: toNumber(structure.basicSalary),
      hra: toNumber(structure.hra),
      transportAllowance: toNumber(structure.transportAllowance),
      medicalAllowance: toNumber(structure.medicalAllowance),
      otherAllowance: toNumber(structure.otherAllowance),
      grossSalary: paidGross,
      pf,
      esi,
      professionalTax,
      tds,
      otherDeduction,
      totalDeductions,
      netSalary: round2(paidGross - totalDeductions),
      workingDays: attendance.workingDays,
      daysPresent: attendance.present,
      daysAbsent: attendance.absent,
      daysPaidLeave: attendance.paidLeave,
      lopDays,
    });
  }

  if (drafts.length === 0) {
    throw ApiError.unprocessable('No employee has a salary structure that applies to this month');
  }

  const totals = drafts.reduce(
    (accumulator, draft) => ({
      gross: round2(accumulator.gross + draft.grossSalary),
      deductions: round2(accumulator.deductions + draft.totalDeductions),
      net: round2(accumulator.net + draft.netSalary),
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  const run = await prisma.$transaction(async (tx) => {
    const payrollRun = await tx.payrollRun.upsert({
      where: { id: existingRun?.id ?? '00000000-0000-0000-0000-000000000000' },
      create: {
        month,
        year,
        status: PayrollStatus.PROCESSED,
        employeeCount: drafts.length,
        totalGrossSalary: totals.gross,
        totalDeductions: totals.deductions,
        totalNetSalary: totals.net,
        processedById: actor.id,
        processedAt: new Date(),
        notes: body.notes ?? null,
      },
      update: {
        employeeCount: drafts.length,
        totalGrossSalary: totals.gross,
        totalDeductions: totals.deductions,
        totalNetSalary: totals.net,
        processedById: actor.id,
        processedAt: new Date(),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      },
      select: { id: true, month: true, year: true, status: true, employeeCount: true, totalGrossSalary: true, totalDeductions: true, totalNetSalary: true },
    });

    for (const draft of drafts) {
      const data = { ...draft, payrollRunId: payrollRun.id, generatedById: actor.id };
      await tx.payslip.upsert({
        where: { employeeId_month_year: { employeeId: draft.employeeId, month, year } },
        create: { ...data, status: PayrollStatus.PROCESSED },
        update: { ...data, status: PayrollStatus.PROCESSED, lockedAt: null },
      });
    }

    return payrollRun;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PAYROLL_PROCESS,
    entity: 'PayrollRun',
    entityId: run.id,
    meta,
    newValue: {
      month,
      year,
      employeeCount: drafts.length,
      totalGrossSalary: totals.gross,
      totalDeductions: totals.deductions,
      totalNetSalary: totals.net,
      ...(missing.length > 0 ? { missingSalaryStructures: missing.length } : {}),
    },
  });

  for (const draft of drafts) {
    await notifyEmployee(draft.employeeId, {
      type: 'SUCCESS',
      title: `Payslip for ${year}-${String(month).padStart(2, '0')} is ready`,
      message: `Net pay ${draft.netSalary.toFixed(2)} for ${draft.daysPresent} present day(s).`,
      link: '/payroll/payslips',
      entityType: 'Payslip',
      entityId: run.id,
    });
  }

  return {
    ...run,
    totalGrossSalary: toNumber(run.totalGrossSalary),
    totalDeductions: toNumber(run.totalDeductions),
    totalNetSalary: toNumber(run.totalNetSalary),
    missingSalaryStructures: missing.length,
    lopDays: drafts.reduce((total, draft) => total + draft.lopDays, 0),
  };
}

export async function lockPayrollRun(id: string, actor: Actor, meta: RequestMeta) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { id: true, month: true, year: true, status: true, employeeCount: true },
  });
  if (!run) throw ApiError.notFound('Payroll run not found');
  if (run.status === PayrollStatus.LOCKED) throw ApiError.conflict('This payroll run is already locked');
  if (run.status !== PayrollStatus.PROCESSED) {
    throw ApiError.unprocessable('Only a processed payroll run can be locked');
  }

  const lockedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.payrollRun.update({
      where: { id },
      data: { status: PayrollStatus.LOCKED, lockedAt },
      select: { id: true, month: true, year: true, status: true, employeeCount: true, totalGrossSalary: true, totalDeductions: true, totalNetSalary: true },
    });

    await tx.payslip.updateMany({
      where: { payrollRunId: id },
      data: { status: PayrollStatus.LOCKED, lockedAt },
    });

    return record;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PAYROLL_LOCK,
    entity: 'PayrollRun',
    entityId: id,
    meta,
    oldValue: { status: run.status },
    newValue: { status: updated.status, payslips: run.employeeCount },
  });

  return {
    ...updated,
    totalGrossSalary: toNumber(updated.totalGrossSalary),
    totalDeductions: toNumber(updated.totalDeductions),
    totalNetSalary: toNumber(updated.totalNetSalary),
  };
}

const PAYSLIP_SELECT = {
  id: true,
  employeeId: true,
  payrollRunId: true,
  month: true,
  year: true,
  basicSalary: true,
  hra: true,
  transportAllowance: true,
  medicalAllowance: true,
  otherAllowance: true,
  grossSalary: true,
  pf: true,
  esi: true,
  professionalTax: true,
  tds: true,
  otherDeduction: true,
  totalDeductions: true,
  netSalary: true,
  workingDays: true,
  daysPresent: true,
  daysAbsent: true,
  daysPaidLeave: true,
  lopDays: true,
  status: true,
  lockedAt: true,
  generatedAt: true,
  employee: { select: EMPLOYEE_BRIEF },
} as const;

const PAYSLIP_MONEY_FIELDS = [
  'basicSalary',
  'hra',
  'transportAllowance',
  'medicalAllowance',
  'otherAllowance',
  'grossSalary',
  'pf',
  'esi',
  'professionalTax',
  'tds',
  'otherDeduction',
  'totalDeductions',
  'netSalary',
] as const;

function serializePayslip<T extends Record<(typeof PAYSLIP_MONEY_FIELDS)[number], Prisma.Decimal>>(payslip: T) {
  const result: Record<string, unknown> = { ...payslip };
  for (const field of PAYSLIP_MONEY_FIELDS) result[field] = toNumber(payslip[field]);
  return result as Omit<T, (typeof PAYSLIP_MONEY_FIELDS)[number]> & Record<(typeof PAYSLIP_MONEY_FIELDS)[number], number>;
}

export async function listPayslips(query: ListPayslipsQuery, scope: EmployeeScope) {
  const where: Prisma.PayslipWhereInput = {
    ...(scope.mode === 'all' ? {} : { employeeId: { in: scope.employeeIds ?? [] } }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.year ? { year: query.year } : {}),
    ...(query.month ? { month: query.month } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payslip.findMany({
      where,
      select: PAYSLIP_SELECT,
      orderBy: [{ year: query.sortOrder }, { month: query.sortOrder }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.payslip.count({ where }),
  ]);

  return { items: items.map(serializePayslip), meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getPayslip(id: string, actor: Actor, scope: EmployeeScope, meta: RequestMeta) {
  const payslip = await prisma.payslip.findUnique({ where: { id }, select: PAYSLIP_SELECT });
  if (!payslip) throw ApiError.notFound('Payslip not found');

  assertCanReadSalary(scope, actor, payslip.employeeId);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: AuditAction.PAYSLIP_DOWNLOAD,
    entity: 'Payslip',
    entityId: id,
    meta,
  });

  return serializePayslip(payslip);
}