export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta: ApiMeta | Record<string, unknown> | null;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: ApiFieldError[];
  meta: null;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginatedResponse<T> {
  items: T[];
  meta: ApiMeta;
}

export type Role =
  | 'SUPER_ADMIN'
  | 'HR_ADMIN'
  | 'HR_MANAGER'
  | 'MANAGER'
  | 'FINANCE'
  | 'RECRUITER'
  | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    profilePhotoUrl: string | null;
    department: { id: string; name: string } | null;
    designation: { id: string; name: string } | null;
  } | null;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}
