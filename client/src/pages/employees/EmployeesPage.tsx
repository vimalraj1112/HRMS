import { useQuery } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { can } from '@/lib/permissions';
import { listEmployees } from '@/services/employee.service';
import { listDepartments } from '@/services/organization.service';
import { useAuthStore } from '@/stores/auth.store';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, type EmployeeStatus, type EmployeeSummary, type EmploymentType } from '@/types/hr';
import { formatDate, fullName, initials } from '@/lib/utils';

const SORTABLE = [
  { value: 'employeeCode', label: 'Employee code' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'joiningDate', label: 'Joining date' },
  { value: 'status', label: 'Status' },
];

export function EmployeesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.user?.role);

  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');

  const query = useMemo(
    () => ({
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 20),
      search: searchParams.get('search') ?? undefined,
      status: (searchParams.get('status') as EmployeeStatus | null) ?? undefined,
      departmentId: searchParams.get('departmentId') ?? undefined,
      employmentType: (searchParams.get('employmentType') as EmploymentType | null) ?? undefined,
      unassigned: searchParams.get('unassigned') === 'true',
      sortBy: searchParams.get('sortBy') ?? 'employeeCode',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc' | null) ?? 'asc',
    }),
    [searchParams],
  );

  const employees = useQuery({
    queryKey: ['employees', 'list', query],
    queryFn: () => listEmployees(query),
  });

  const departments = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    enabled: can(role, 'department:read'),
    staleTime: 5 * 60_000,
  });

  const patchParams = (patch: Record<string, string | number | boolean | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patch)) next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const hasFilters = Boolean(query.search || query.status || query.departmentId || query.employmentType || query.unassigned);

  const columns: Column<EmployeeSummary>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar src={row.profilePhotoUrl} fallback={initials(row.firstName, row.lastName)} size="sm" />
          <div className="min-w-0">
            <Link to={`/employees/${row.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">
              {fullName(row)}
            </Link>
            <p className="truncate text-xs text-slate-500">
              {row.employeeCode} · {row.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => <span className="text-slate-700">{row.department?.name ?? <span className="text-slate-400">Unassigned</span>}</span>,
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (row) => row.designation?.name ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'manager',
      header: 'Reports to',
      render: (row) => (row.manager ? fullName(row.manager) : <span className="text-slate-400">—</span>),
    },
    {
      key: 'employmentType',
      header: 'Type',
      render: (row) => (
        <Badge tone="info">{row.employmentType.replace(/_/g, ' ').toLowerCase()}</Badge>
      ),
    },
    {
      key: 'joiningDate',
      header: 'Joined',
      render: (row) => <span className="whitespace-nowrap text-slate-600">{formatDate(row.joiningDate)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Search, filter and manage the people directory."
        actions={
          can(role, 'employee:create') ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/employees/new')}>
              Add employee
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-end">
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              patchParams({ search: searchDraft.trim() });
            }}
          >
            <Input
              name="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by name, email or employee code"
              leftSlot={<Search className="h-4 w-4" aria-hidden />}
            />
          </form>

          <div className="grid grid-cols-2 gap-3 lg:flex lg:items-end">
            <Select
              label="Status"
              className="lg:w-36"
              value={query.status ?? ''}
              placeholder="Any status"
              options={EMPLOYEE_STATUSES}
              onChange={(event) => patchParams({ status: event.target.value })}
            />
            <Select
              label="Department"
              className="lg:w-48"
              value={query.departmentId ?? ''}
              placeholder="All departments"
              options={(departments.data?.items ?? []).map((department) => ({
                value: department.id,
                label: department.name,
              }))}
              onChange={(event) => patchParams({ departmentId: event.target.value })}
            />
            <Select
              label="Type"
              className="lg:w-36"
              value={query.employmentType ?? ''}
              placeholder="Any type"
              options={EMPLOYMENT_TYPES}
              onChange={(event) => patchParams({ employmentType: event.target.value })}
            />
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={query.unassigned}
                onChange={(event) => patchParams({ unassigned: event.target.checked ? 'true' : null })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Unassigned
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>
              Sort by
              <select
                value={query.sortBy}
                onChange={(event) => patchParams({ sortBy: event.target.value })}
                className="ml-1.5 rounded border-0 bg-transparent py-0.5 pl-1 pr-6 text-sm font-medium text-slate-700 focus:ring-1 focus:ring-brand-500"
              >
                {SORTABLE.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
            <button
              type="button"
              onClick={() => patchParams({ sortOrder: query.sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="rounded px-2 py-0.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {query.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>

          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setSearchDraft('');
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={employees.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={employees.isPending}
          isFetching={employees.isFetching}
          error={employees.error}
          onRetry={() => void employees.refetch()}
          onRowClick={(row) => navigate(`/employees/${row.id}`)}
          emptyTitle="No employees match your filters"
          emptyAction={
            hasFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchDraft('');
                  setSearchParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
          footer={
            <Pagination
              meta={employees.data?.meta}
              onPageChange={(page) => patchParams({ page })}
              onLimitChange={(limit) => patchParams({ limit })}
            />
          }
        />
      </Card>
    </>
  );
}
