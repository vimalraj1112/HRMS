import type { OrgRef, PageQuery } from './hr';

export type PayrollStatus = 'DRAFT' | 'PROCESSED' | 'LOCKED';

export const PAYROLL_STATUSES: { value: PayrollStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PROCESSED', label: 'Processed' },
  { value: 'LOCKED', label: 'Locked' },
];

export interface SalaryStructure {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
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
  netSalary: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: OrgRef | null };
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  employeeCount: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetSalary: number;
  processedAt: string | null;
  lockedAt: string | null;
  notes: string | null;
  createdAt: string;
  processedBy: { email: string } | null;
}

export interface Payslip {
  id: string;
  employeeId: string;
  payrollRunId: string | null;
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
  status: PayrollStatus;
  lockedAt: string | null;
  generatedAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: OrgRef | null };
}

export interface PayslipEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  joiningDate: string;
  panNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  esiNumber: string | null;
  pfNumber: string | null;
  uan: string | null;
  payMode: string | null;
  department: OrgRef | null;
  designation: OrgRef | null;
}

export interface PayslipDays {
  totalDays: number;
  weeklyOff: number;
  paidHolidays: number;
  workingDays: number;
  lwp: number;
  presentDays: number;
  paidLeaves: number;
  maximumPayableDays: number;
  netPaidDays: number;
  newJoinerArrearDays: number;
  lop: number;
}

export interface PayslipPrint extends Payslip {
  employee: PayslipEmployee;
  period: { monthLabel: string; fromDate: string; toDate: string };
  days: PayslipDays;
  reimbursements: { telephone: number; lta: number; total: number };
  newJoinerArrearDays: number;
}

export interface PayslipPrintSheet {
  period: { monthLabel: string; fromDate: string; toDate: string };
  count: number;
  items: PayslipPrint[];
}

export interface PayslipPrintQuery {
  year: string;
  month: string;
  employeeId?: string;
}

export interface ProcessPayrollResult {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  employeeCount: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetSalary: number;
  missingSalaryStructures: number;
  lopDays: number;
}

export interface SalaryListQuery extends PageQuery {
  employeeId?: string;
  isActive?: boolean;
}

export interface PayrollRunListQuery extends PageQuery {
  year?: string;
  month?: string;
  status?: PayrollStatus;
}

export interface PayslipListQuery extends PageQuery {
  year?: string;
  month?: string;
  employeeId?: string;
  status?: PayrollStatus;
}

export interface SalaryStructurePayload {
  employeeId: string;
  effectiveFrom: string;
  basicSalary: number;
  hra?: number;
  transportAllowance?: number;
  medicalAllowance?: number;
  otherAllowance?: number;
  pf?: number;
  esi?: number;
  professionalTax?: number;
  tds?: number;
  otherDeduction?: number;
  isActive?: boolean;
}

export interface SalaryStructurePatch {
  effectiveFrom?: string;
  basicSalary?: number;
  hra?: number;
  transportAllowance?: number;
  medicalAllowance?: number;
  otherAllowance?: number;
  pf?: number;
  esi?: number;
  professionalTax?: number;
  tds?: number;
  otherDeduction?: number;
  isActive?: boolean;
}

export interface ProcessPayrollPayload {
  year: number;
  month: number;
  notes?: string;
}