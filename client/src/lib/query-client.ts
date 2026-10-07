import { QueryClient } from '@tanstack/react-query';

export { toMessage } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export const queryKeys = {
  auth: { me: ['auth', 'me'] as const },
  dashboard: (role: string) => ['dashboard', role] as const,
  employees: (params: unknown) => ['employees', 'list', params] as const,
  employee: (id: string) => ['employees', 'detail', id] as const,
  departments: ['departments', 'list'] as const,
  designations: ['designations', 'list'] as const,
  attendance: (params: unknown) => ['attendance', 'list', params] as const,
  myAttendance: (params: unknown) => ['attendance', 'my', params] as const,
  leaves: (params: unknown) => ['leaves', 'list', params] as const,
  myLeaves: (params: unknown) => ['leaves', 'my', params] as const,
  leaveTypes: ['leave-types', 'list'] as const,
  leaveBalances: (params: unknown) => ['leave-balances', params] as const,
  holidays: (params: unknown) => ['holidays', params] as const,
  notifications: (params: unknown) => ['notifications', params] as const,
  announcements: (params: unknown) => ['announcements', params] as const,
  payslips: (params: unknown) => ['payslips', params] as const,
  documents: (params: unknown) => ['documents', params] as const,
  jobs: (params: unknown) => ['jobs', params] as const,
  candidates: (params: unknown) => ['candidates', params] as const,
  interviews: (params: unknown) => ['interviews', params] as const,
  offers: (params: unknown) => ['offers', params] as const,
  goals: (params: unknown) => ['goals', params] as const,
  reviews: (params: unknown) => ['reviews', params] as const,
  auditLogs: (params: unknown) => ['audit-logs', params] as const,
};
