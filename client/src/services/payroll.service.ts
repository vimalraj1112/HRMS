import { api, cleanQuery } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type {
  PayrollRun,
  PayrollRunListQuery,
  Payslip,
  PayslipListQuery,
  ProcessPayrollPayload,
  ProcessPayrollResult,
  SalaryListQuery,
  SalaryStructure,
  SalaryStructurePatch,
  SalaryStructurePayload,
} from '@/types/payroll';
import type { Page } from './employee.service';

export async function listSalaryStructures(query: SalaryListQuery = {}): Promise<Page<SalaryStructure>> {
  const response = await api.get<ApiSuccess<SalaryStructure[]>>('/payroll/salary-structures', {
    params: cleanQuery(query),
  });
  return { items: response.data.data, meta: response.data.meta as Page<SalaryStructure>['meta'] };
}

export async function getSalaryStructure(id: string): Promise<SalaryStructure> {
  const response = await api.get<ApiSuccess<SalaryStructure>>(`/payroll/salary-structures/${id}`);
  return response.data.data;
}

export async function createSalaryStructure(payload: SalaryStructurePayload): Promise<SalaryStructure> {
  const response = await api.post<ApiSuccess<SalaryStructure>>('/payroll/salary-structures', payload);
  return response.data.data;
}

export async function updateSalaryStructure(
  id: string,
  payload: SalaryStructurePatch,
): Promise<SalaryStructure> {
  const response = await api.patch<ApiSuccess<SalaryStructure>>(`/payroll/salary-structures/${id}`, payload);
  return response.data.data;
}

export async function deleteSalaryStructure(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`/payroll/salary-structures/${id}`);
  return response.data.data;
}

export async function listPayrollRuns(query: PayrollRunListQuery = {}): Promise<Page<PayrollRun>> {
  const response = await api.get<ApiSuccess<PayrollRun[]>>('/payroll/runs', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<PayrollRun>['meta'] };
}

export async function processPayroll(payload: ProcessPayrollPayload): Promise<ProcessPayrollResult> {
  const response = await api.post<ApiSuccess<ProcessPayrollResult>>('/payroll/runs/process', payload);
  return response.data.data;
}

export async function lockPayrollRun(id: string): Promise<PayrollRun> {
  const response = await api.post<ApiSuccess<PayrollRun>>(`/payroll/runs/${id}/lock`);
  return response.data.data;
}

export async function listPayslips(query: PayslipListQuery = {}): Promise<Page<Payslip>> {
  const response = await api.get<ApiSuccess<Payslip[]>>('/payroll/payslips', { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as Page<Payslip>['meta'] };
}

export async function getPayslip(id: string): Promise<Payslip> {
  const response = await api.get<ApiSuccess<Payslip>>(`/payroll/payslips/${id}`);
  return response.data.data;
}