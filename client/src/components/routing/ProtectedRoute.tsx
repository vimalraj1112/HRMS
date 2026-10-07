import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { meRequest } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Role } from '@/types/api';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Role[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);
  const location = useLocation();

  const hasToken = useAuthStore((state) => Boolean(state.accessToken));
  const shouldVerify = isAuthenticated && hasToken;

  const session = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: meRequest,
    enabled: shouldVerify,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (session.data && session.data.id !== user?.id) setUser(session.data);
  }, [session.data, user?.id, setUser]);

  useEffect(() => {
    if (!session.isError) return;
    const status = (session.error as { status?: number } | null)?.status;
    if (status === 401 || status === 403) clear();
  }, [session.isError, session.error, clear]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (shouldVerify && session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verifying your session...
        </div>
      </div>
    );
  }

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && roles.length > 0 && user && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
