import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toMessage } from '@/lib/api';
import { changePasswordRequest } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';

const passwordRules = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordRules,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used before',
  });

type ChangePasswordForm = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      // The server revokes every session on a password change, so start fresh.
      clear();
      toast.success('Password updated. Please sign in with your new password.');
      void navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(toMessage(error)),
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.employee
              ? `Hi ${user.employee.firstName}, you must set a new password before continuing.`
              : 'You must set a new password before continuing.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            leftSlot={<Lock className="h-4 w-4" />}
            error={form.formState.errors.currentPassword?.message}
            {...form.register('currentPassword')}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            error={form.formState.errors.newPassword?.message}
            {...form.register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={form.formState.errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />

          <Button type="submit" block size="lg" isLoading={mutation.isPending}>
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
