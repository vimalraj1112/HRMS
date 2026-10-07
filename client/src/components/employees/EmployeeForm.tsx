import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { listEmployees } from '@/services/employee.service';
import { listDepartments, listDesignations } from '@/services/organization.service';
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  type EmployeeDetail,
} from '@/types/hr';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const phonePattern = /^[+]?[0-9\s()-]{7,20}$/;
const DATE_HINT = 'Use the YYYY-MM-DD format';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDate = z.string().regex(datePattern, DATE_HINT).optional().or(z.literal(''));
const optionalUuid = z.string().uuid('Select a valid option').optional().or(z.literal(''));
const optionalPhone = z
  .string()
  .trim()
  .regex(phonePattern, 'Enter a valid phone number')
  .optional()
  .or(z.literal(''));

const fullSchema = z.object({
  employeeCode: z.string().trim().max(20).optional().or(z.literal('')),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: optionalPhone,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().or(z.literal('')),
  dateOfBirth: optionalDate,
  joiningDate: z.string().regex(datePattern, DATE_HINT),
  exitDate: optionalDate,
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']),
  status: z.enum(['ACTIVE', 'ON_NOTE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED']),
  departmentId: optionalUuid,
  designationId: optionalUuid,
  managerId: optionalUuid,
  address: optionalText(255),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  panNumber: optionalText(20),
  aadhaarNumber: optionalText(20),
  bankName: optionalText(120),
  bankAccountNumber: optionalText(40),
  bankIfsc: optionalText(20),
});

const selfSchema = z.object({
  phone: optionalPhone,
  address: optionalText(255),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(20),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  profilePhotoUrl: z
    .string()
    .trim()
    .url('Enter a valid image URL')
    .max(500)
    .optional()
    .or(z.literal('')),
});

type FullForm = z.infer<typeof fullSchema>;
type SelfForm = z.infer<typeof selfSchema>;

export type EmployeeFormMode = 'create' | 'edit' | 'self';

export interface EmployeeFormProps {
  mode: EmployeeFormMode;
  defaultValues?: Partial<EmployeeDetail>;
  isSubmitting?: boolean;
  formError?: string | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const text = typeof value === 'string' ? value : value.toISOString();
  return text.slice(0, 10);
}

function cleanValues(values: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value.trim();
  }
  return cleaned;
}

export function EmployeeForm(props: EmployeeFormProps) {
  return props.mode === 'self' ? <SelfServiceForm {...props} /> : <FullEmployeeForm {...props} />;
}

function SelfServiceForm({ defaultValues, isSubmitting, formError, onSubmit, onCancel }: EmployeeFormProps) {
  const form = useForm<SelfForm>({
    resolver: zodResolver(selfSchema),
    defaultValues: {
      phone: defaultValues?.phone ?? '',
      address: defaultValues?.address ?? '',
      city: defaultValues?.city ?? '',
      state: defaultValues?.state ?? '',
      postalCode: defaultValues?.postalCode ?? '',
      emergencyContactName: defaultValues?.emergencyContactName ?? '',
      emergencyContactPhone: defaultValues?.emergencyContactPhone ?? '',
      profilePhotoUrl: defaultValues?.profilePhotoUrl ?? '',
    },
  });

  const { errors } = form.formState;

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit(cleanValues(values)))}>
      <FormError message={formError} />

      <Input label="Phone" error={errors.phone?.message} {...form.register('phone')} />
      <Textarea label="Address" error={errors.address?.message} {...form.register('address')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="City" error={errors.city?.message} {...form.register('city')} />
        <Input label="State" error={errors.state?.message} {...form.register('state')} />
        <Input label="Postal code" error={errors.postalCode?.message} {...form.register('postalCode')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Emergency contact name"
          error={errors.emergencyContactName?.message}
          {...form.register('emergencyContactName')}
        />
        <Input
          label="Emergency contact phone"
          error={errors.emergencyContactPhone?.message}
          {...form.register('emergencyContactPhone')}
        />
      </div>
      <Input
        label="Profile photo URL"
        placeholder="https://"
        error={errors.profilePhotoUrl?.message}
        {...form.register('profilePhotoUrl')}
      />

      <FormActions isSubmitting={isSubmitting} onCancel={onCancel} submitLabel="Save changes" />
    </form>
  );
}

function FullEmployeeForm({ mode, defaultValues, isSubmitting, formError, onSubmit, onCancel }: EmployeeFormProps) {
  const form = useForm<FullForm>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      employeeCode: defaultValues?.employeeCode ?? '',
      firstName: defaultValues?.firstName ?? '',
      middleName: defaultValues?.middleName ?? '',
      lastName: defaultValues?.lastName ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      gender: (defaultValues?.gender ?? ''),
      dateOfBirth: toDateInput(defaultValues?.dateOfBirth),
      joiningDate: toDateInput(defaultValues?.joiningDate) || new Date().toISOString().slice(0, 10),
      exitDate: toDateInput(defaultValues?.exitDate),
      employmentType: (defaultValues?.employmentType ?? 'FULL_TIME'),
      status: (defaultValues?.status ?? 'ACTIVE'),
      departmentId: defaultValues?.departmentId ?? '',
      designationId: defaultValues?.designationId ?? '',
      managerId: defaultValues?.managerId ?? '',
      address: defaultValues?.address ?? '',
      city: defaultValues?.city ?? '',
      state: defaultValues?.state ?? '',
      postalCode: defaultValues?.postalCode ?? '',
      country: defaultValues?.country ?? 'India',
      emergencyContactName: defaultValues?.emergencyContactName ?? '',
      emergencyContactPhone: defaultValues?.emergencyContactPhone ?? '',
      panNumber: defaultValues?.panNumber ?? '',
      aadhaarNumber: defaultValues?.aadhaarNumber ?? '',
      bankName: defaultValues?.bankName ?? '',
      bankAccountNumber: defaultValues?.bankAccountNumber ?? '',
      bankIfsc: defaultValues?.bankIfsc ?? '',
    },
  });

  const departments = useQuery({
    queryKey: ['departments', 'options'],
    queryFn: () => listDepartments({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    staleTime: 5 * 60_000,
  });

  const designations = useQuery({
    queryKey: ['designations', 'options'],
    queryFn: () => listDesignations({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    staleTime: 5 * 60_000,
  });

  const managers = useQuery({
    queryKey: ['employees', 'manager-options'],
    queryFn: () => listEmployees({ limit: 100, sortBy: 'employeeCode', sortOrder: 'asc' }),
    staleTime: 5 * 60_000,
  });

  const { errors } = form.formState;

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((values) => onSubmit(cleanValues(values)))}>
      <FormError message={formError} />

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Personal details</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="First name" error={errors.firstName?.message} {...form.register('firstName')} />
          <Input label="Middle name" error={errors.middleName?.message} {...form.register('middleName')} />
          <Input label="Last name" error={errors.lastName?.message} {...form.register('lastName')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Work email" type="email" error={errors.email?.message} {...form.register('email')} />
          <Input label="Phone" error={errors.phone?.message} {...form.register('phone')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Gender"
            placeholder="Not specified"
            options={GENDERS}
            error={errors.gender?.message}
            {...form.register('gender')}
          />
          <Input label="Date of birth" type="date" error={errors.dateOfBirth?.message} {...form.register('dateOfBirth')} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Employment</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Employee code"
            hint={mode === 'create' ? 'Leave blank to auto-generate' : undefined}
            error={errors.employeeCode?.message}
            {...form.register('employeeCode')}
          />
          <Select
            label="Employment type"
            options={EMPLOYMENT_TYPES}
            error={errors.employmentType?.message}
            {...form.register('employmentType')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Joining date" type="date" error={errors.joiningDate?.message} {...form.register('joiningDate')} />
          <Input label="Exit date" type="date" error={errors.exitDate?.message} {...form.register('exitDate')} />
          {mode === 'create' ? <Select label="Status" options={EMPLOYEE_STATUSES} {...form.register('status')} /> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Department"
            placeholder="Unassigned"
            options={(departments.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
            error={errors.departmentId?.message}
            {...form.register('departmentId')}
          />
          <Select
            label="Designation"
            placeholder="Unassigned"
            options={(designations.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
            error={errors.designationId?.message}
            {...form.register('designationId')}
          />
          <Select
            label="Reports to"
            placeholder="No manager"
            options={(managers.data?.items ?? [])
              .filter((item) => item.id !== defaultValues?.id)
              .map((item) => ({ value: item.id, label: `${item.employeeCode} · ${item.firstName} ${item.lastName}` }))}
            error={errors.managerId?.message}
            {...form.register('managerId')}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Contact</legend>
        <Textarea label="Address" error={errors.address?.message} {...form.register('address')} />
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="City" error={errors.city?.message} {...form.register('city')} />
          <Input label="State" error={errors.state?.message} {...form.register('state')} />
          <Input label="Postal code" error={errors.postalCode?.message} {...form.register('postalCode')} />
          <Input label="Country" error={errors.country?.message} {...form.register('country')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Emergency contact name"
            error={errors.emergencyContactName?.message}
            {...form.register('emergencyContactName')}
          />
          <Input
            label="Emergency contact phone"
            error={errors.emergencyContactPhone?.message}
            {...form.register('emergencyContactPhone')}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Documents and banking</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="PAN number" error={errors.panNumber?.message} {...form.register('panNumber')} />
          <Input label="Aadhaar number" error={errors.aadhaarNumber?.message} {...form.register('aadhaarNumber')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Bank name" error={errors.bankName?.message} {...form.register('bankName')} />
          <Input label="Account number" error={errors.bankAccountNumber?.message} {...form.register('bankAccountNumber')} />
          <Input label="IFSC code" error={errors.bankIfsc?.message} {...form.register('bankIfsc')} />
        </div>
      </fieldset>

      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={mode === 'create' ? 'Create employee' : 'Save changes'}
      />
    </form>
  );
}

function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>;
}

function FormActions({
  isSubmitting,
  onCancel,
  submitLabel,
}: {
  isSubmitting?: boolean;
  onCancel?: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
      {onCancel ? (
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>
        {submitLabel}
      </Button>
    </div>
  );
}
