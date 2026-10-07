export interface AuthUser {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: string;
  employeeId: string | null;
  tokenVersion: number;
  jti: string;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}

export interface AuthEmployeeContext {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  profilePhotoUrl: string | null;
  status: string;
  managerId: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
}

export interface AuthContext {
  user: AuthUser;
  ip: string;
  userAgent: string;
}
