import type { Role } from '@/types/api';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION';

export interface UserEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl: string | null;
  status: string;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
}

export interface UserAccount {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  employeeId: string | null;
  lastLoginAt: string | null;
  lockedUntil?: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt?: string;
  employee: UserEmployee | null;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  role?: Role;
  status?: UserStatus;
  unlinkedOnly?: boolean;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  role: Role;
  employeeId?: string;
  mustChangePassword?: boolean;
}

export interface CreatedUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  employeeId: string | null;
  mustChangePassword: boolean;
}

export interface UpdateUserStatusPayload {
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  reason?: string;
}

export interface ResetPasswordPayload {
  newPassword?: string;
  mustChangePassword?: boolean;
}

export interface ResetPasswordResult {
  id: string;
  email: string;
  mustChangePassword: boolean;
  temporaryPassword: string | null;
}
