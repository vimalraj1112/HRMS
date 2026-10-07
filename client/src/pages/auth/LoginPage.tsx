import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Lock, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toMessage } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { loginRequest } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword ?? false);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    if (!isAuthenticated) return;
    void navigate(mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
  }, [isAuthenticated, mustChangePassword, navigate]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: (values: LoginForm) => loginRequest(values.email, values.password),
    onSuccess: (data) => {
      setSession({ user: data.user, accessToken: data.tokens.accessToken });
      void queryClient.invalidateQueries();

      if (data.user.mustChangePassword) {
        toast.info('Please set a new password to finish signing in.');
        void navigate('/change-password', { replace: true });
        return;
      }

      toast.success(`Welcome back, ${data.user.employee?.firstName ?? data.user.email}`);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from ?? '/dashboard', { replace: true });
    },
    onError: (error) => {
      toast.error(toMessage(error));
    },
  });

  const onSubmit = form.handleSubmit((values) => loginMutation.mutate(values));

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            SL
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">SuperLink HRMS</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@superlinkitservices.com"
            leftSlot={<Mail className="h-4 w-4" />}
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            leftSlot={<Lock className="h-4 w-4" />}
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />

          <Button type="submit" block size="lg" isLoading={loginMutation.isPending}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          SuperLink IT Services &middot; Human Resource Management System
        </p>
      </div>
    </div>
  );
}
