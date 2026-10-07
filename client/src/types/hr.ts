export type EmployeeStatus = 'ACTIVE' | 'ON_NOTE' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'CONSULTANT';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export const EMPLOYEE_STATUSES: { value: EmployeeStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_NOTE', label: 'On note' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
];

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'CONSULTANT', label: 'Consultant' },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export interface OrgRef {
  id: string;
  name: string;
  code: string;
}

export interface ManagerRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

export interface EmployeeLinkedUser {
  id: string;
  role: string;
  status: string;
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  joiningDate: string;
  exitDate: string | null;
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  user: EmployeeLinkedUser | null;
  department: OrgRef | null;
  designation: OrgRef | null;
  manager: ManagerRef | null;
}

export interface DirectReportRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
}

export interface EmployeeDetail extends EmployeeSummary {
  gender: Gender | null;
  dateOfBirth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  createdAt: string;
  updatedAt: string;
  directReports: DirectReportRef[];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  head: (ManagerRef & { email: string }) | null;
  _count: { employees: number };
}

export interface Designation {
  id: string;
  name: string;
  code: string;
  level: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { employees: number };
}

export type SortOrder = 'asc' | 'desc';

export interface PageQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface EmployeeListQuery extends PageQuery {
  departmentId?: string;
  designationId?: string;
  managerId?: string;
  status?: EmployeeStatus;
  employmentType?: EmploymentType;
  unassigned?: boolean;
}

export interface OrgListQuery extends PageQuery {
  includeInactive?: boolean;
}

export interface EmployeePayload {
  employeeCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  joiningDate: string;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  departmentId?: string;
  designationId?: string;
  managerId?: string;
  exitDate?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  profilePhotoUrl?: string;
}

export type EmployeeUpdatePayload = Partial<EmployeePayload>;

export interface StatusChangePayload {
  status: EmployeeStatus;
  exitDate?: string;
  reason?: string;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  description?: string;
  headId?: string;
  isActive?: boolean;
}

export interface DesignationPayload {
  name: string;
  code: string;
  level: number;
  description?: string;
  isActive?: boolean;
}
