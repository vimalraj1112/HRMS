import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { listEmployees } from '@/services/employee.service';
import {
  createSalaryStructure,
  deleteSalaryStructure,
  listSalaryStructures,
  updateSalaryStructure,
} from '@/services/payroll.service';
import type { SalaryStructure, SalaryStructurePayload } from '@/types/payroll';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = new Date().toISOString().slice(0, 10);

const schema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date'),
  basicSalary: z.coerce.number().positive('Basic salary must be greater than zero'),
  hra: z.coerce.number().min(0, 'HRA cannot be negative'),
  transportAllowance: z.coerce.number().min(0, 'Transport cannot be negative'),
  medicalAllowance: z.coerce.number().min(0, 'Medical cannot be negative'),
  otherAllowance: z.coerce.number().min(0, 'Other allowance cannot be negative'),
  pf: z.coerce.number().min(0, 'PF cannot be negative'),
  esi: z.coerce.number().min(0, 'ESI cannot be negative'),
  professionalTax: z.coerce.number().min(0, 'Professional tax cannot be negative'),
  tds: z.coerce.number().min(0, 'TDS cannot be negative'),
  otherDeduction: z.coerce.number().min(0, 'Other deduction cannot be negative'),
});

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  effectiveFrom: today,
  basicSalary: 25000,
  hra: 0,
  transportAllowance: 0,
  medicalAllowance: 0,
  otherAllowance: 0,
  pf: 0,
  esi: 0,
  professionalTax: 0,
  tds: 0,
  otherDeduction: 0,
};

export function SalaryStructuresPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const [employeeId, setEmployeeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SalaryStructure | null>(null);
  const [removing, setRemoving] = useState<SalaryStructure | null>(null);

  const canManage = can(role, 'salary:manage');

  const employees = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => listEmployees({ limit: 200, sortBy: 'employeeCode', sortOrder: 'asc' }),
    enabled: canManage,
  });

  const structures = useQuery({
    queryKey: ['payroll', 'salary', { page, employeeId }],
    queryFn: () =>
      listSalaryStructures({
        page,
        limit: 20,
        employeeId: employeeId || undefined,
        sortBy: 'effectiveFrom',
        sortOrder: 'desc',
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['payroll', 'salary'] });
  };

  const save = useMutation({
    mutationFn: (input: { id?: string; employeeId: string; values: FormValues }) => {
      const payload: SalaryStructurePayload = {
        employeeId: input.employeeId,
        effectiveFrom: input.values.effectiveFrom,
        basicSalary: input.values.basicSalary,
        hra: input.values.hra,
        transportAllowance: input.values.transportAllowance,
        medicalAllowance: input.values.medicalAllowance,
        otherAllowance: input.values.otherAllowance,
        pf: input.values.pf,
        esi: input.values.esi,
        professionalTax: input.values.professionalTax,
        tds: input.values.tds,
        otherDeduction: input.values.otherDeduction,
      };
      return input.id
        ? updateSalaryStructure(input.id, payload)
        : createSalaryStructure(payload);
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.id ? 'Salary structure updated' : 'Salary structure created');
      setCreating(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSalaryStructure(id),
    onSuccess: () => {
      toast.success('Salary structure removed');
      setRemoving(null);
      invalidate();
    },
    onError: (error) => {
      setRemoving(null);
      toast.error(toMessage(error));
    },
  });

  const columns: Column<SalaryStructure>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">
            {row.employee.firstName} {row.employee.lastName}
          </p>
          <p className="text-xs text-slate-500">
            {row.employee.employeeCode}
            {row.employee.department ? ` · ${row.employee.department.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'effective',
      header: 'Effective',
      render: (row) => (
        <span className="text-sm">
          {row.effectiveFrom}
          {row.effectiveTo ? ` → ${row.effectiveTo}` : ' → open'}
        </span>
      ),
    },
    {
      key: 'basic',
      header: 'Basic',
      className: 'text-right',
      render: (row) => <span className="tabular-nums">{money(row.basicSalary)}</span>,
    },
    {
      key: 'gross',
      header: 'Gross',
      className: 'text-right',
      render: (row) => <span className="tabular-nums">{money(row.grossSalary)}</span>,
    },
    {
      key: 'deductions',
      header: 'Deductions',
      className: 'text-right',
      render: (row) => (
        <span className="tabular-nums text-rose-600">
          {money(row.pf + row.esi + row.professionalTax + row.tds + row.otherDeduction)}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'Net',
      className: 'text-right',
      render: (row) => <span className="font-medium tabular-nums">{money(row.netSalary)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (row: SalaryStructure) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(row)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRemoving(row)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          } as Column<SalaryStructure>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Salary Structures"
        description="Gross is the sum of the allowances. Net is gross minus every deduction."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New structure
            </Button>
          ) : undefined
        }
      />

      <Card>
        {canManage ? (
          <div className="border-b border-slate-200 p-4 sm:w-1/2">
            <Select
              label="Employee"
              value={employeeId}
              onChange={(event) => {
                setEmployeeId(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All employees' },
                ...(employees.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.employeeCode} · ${item.firstName} ${item.lastName}`,
                })),
              ]}
            />
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={structures.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={structures.isPending}
          isFetching={structures.isFetching}
          error={structures.error}
          onRetry={() => void structures.refetch()}
          emptyTitle="No salary structures"
          emptyDescription="Create a structure so this employee can be included in payroll."
        />

        <Pagination meta={structures.data?.meta} onPageChange={setPage} />
      </Card>

      {creating ? (
        <SalaryStructureDialog
          key="create"
          title="New salary structure"
          employees={(employees.data?.items ?? []).map((item) => ({
            value: item.id,
            label: `${item.employeeCode} · ${item.firstName} ${item.lastName}`,
          }))}
          isSubmitting={save.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(employeeIdValue, values) => save.mutate({ employeeId: employeeIdValue, values })}
        />
      ) : null}

      {editing ? (
        <SalaryStructureDialog
          key={editing.id}
          title={`Edit ${editing.employee.firstName} ${editing.employee.lastName}`}
          initial={editing}
          isSubmitting={save.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(_employeeId, values) => save.mutate({ id: editing.id, employeeId: editing.employeeId, values })}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Remove salary structure"
        message="Only structures that have not taken effect and have no payslips can be removed. Deactivate it instead to keep history."
        confirmLabel="Remove"
        isLoading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

function SalaryStructureDialog({
  title,
  employees,
  initial,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  title: string;
  employees?: { value: string; label: string }[];
  initial?: SalaryStructure;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (employeeId: string, values: FormValues) => void;
}) {
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? '');
  const [values, setValues] = useState<FormValues>(
    initial
      ? {
          effectiveFrom: initial.effectiveFrom.slice(0, 10),
          basicSalary: initial.basicSalary,
          hra: initial.hra,
          transportAllowance: initial.transportAllowance,
          medicalAllowance: initial.medicalAllowance,
          otherAllowance: initial.otherAllowance,
          pf: initial.pf,
          esi: initial.esi,
          professionalTax: initial.professionalTax,
          tds: initial.tds,
          otherDeduction: initial.otherDeduction,
        }
      : emptyValues,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totals = useMemo(() => {
    const gross =
      values.basicSalary +
      values.hra +
      values.transportAllowance +
      values.medicalAllowance +
      values.otherAllowance;
    const deductions = values.pf + values.esi + values.professionalTax + values.tds + values.otherDeduction;
    return { gross, deductions, net: gross - deductions };
  }, [values]);

  const submit = () => {
    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      setErrors(fieldErrors);
      return;
    }

    if (totals.net < 0) {
      setErrors({ otherDeduction: 'Deductions cannot exceed the gross salary' });
      return;
    }

    setErrors({});
    onSubmit(employeeId, result.data);
  };

  const setField = (field: keyof FormValues, value: number | string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isSubmitting} onClick={submit}>
            Save structure
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {employees ? (
          <Select
            label="Employee"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            options={employees}
            placeholder="Select an employee"
          />
        ) : null}

        <Input
          label="Effective from"
          type="date"
          value={values.effectiveFrom}
          error={errors.effectiveFrom}
          onChange={(event) => setField('effectiveFrom', event.target.value)}
        />

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Basic salary"
              type="number"
              min={0}
              step="0.01"
              value={values.basicSalary}
              error={errors.basicSalary}
              onChange={(event) => setField('basicSalary', Number(event.target.value))}
            />
            <Input
              label="HRA"
              type="number"
              min={0}
              step="0.01"
              value={values.hra}
              error={errors.hra}
              onChange={(event) => setField('hra', Number(event.target.value))}
            />
            <Input
              label="Transport allowance"
              type="number"
              min={0}
              step="0.01"
              value={values.transportAllowance}
              error={errors.transportAllowance}
              onChange={(event) => setField('transportAllowance', Number(event.target.value))}
            />
            <Input
              label="Medical allowance"
              type="number"
              min={0}
              step="0.01"
              value={values.medicalAllowance}
              error={errors.medicalAllowance}
              onChange={(event) => setField('medicalAllowance', Number(event.target.value))}
            />
            <Input
              label="Other allowance"
              type="number"
              min={0}
              step="0.01"
              value={values.otherAllowance}
              error={errors.otherAllowance}
              onChange={(event) => setField('otherAllowance', Number(event.target.value))}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="PF"
              type="number"
              min={0}
              step="0.01"
              value={values.pf}
              error={errors.pf}
              onChange={(event) => setField('pf', Number(event.target.value))}
            />
            <Input
              label="ESI"
              type="number"
              min={0}
              step="0.01"
              value={values.esi}
              error={errors.esi}
              onChange={(event) => setField('esi', Number(event.target.value))}
            />
            <Input
              label="Professional tax"
              type="number"
              min={0}
              step="0.01"
              value={values.professionalTax}
              error={errors.professionalTax}
              onChange={(event) => setField('professionalTax', Number(event.target.value))}
            />
            <Input
              label="TDS"
              type="number"
              min={0}
              step="0.01"
              value={values.tds}
              error={errors.tds}
              onChange={(event) => setField('tds', Number(event.target.value))}
            />
            <Input
              label="Other deduction"
              type="number"
              min={0}
              step="0.01"
              value={values.otherDeduction}
              error={errors.otherDeduction}
              onChange={(event) => setField('otherDeduction', Number(event.target.value))}
            />
          </div>
        </fieldset>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-600">Gross {money(totals.gross)}</span>
          <span className="text-rose-600">Deductions {money(totals.deductions)}</span>
          <span className="font-semibold text-slate-900">Net {money(totals.net)}</span>
        </div>
      </div>
    </Modal>
  );
}