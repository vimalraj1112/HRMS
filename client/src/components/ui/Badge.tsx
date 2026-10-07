import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-slate-100 text-slate-700',
      success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
      warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
      danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
      info: 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/20',
      purple: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  children: ReactNode;
}

export function Badge({ className, tone, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {children}
    </span>
  );
}

const TONE_BY_STATUS: Record<string, BadgeProps['tone']> = {
  ACTIVE: 'success',
  PRESENT: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  OPEN: 'info',
  PENDING: 'warning',
  SUBMITTED: 'info',
  SCHEDULED: 'info',
  DRAFT: 'neutral',
  INACTIVE: 'neutral',
  RESIGNED: 'neutral',
  CANCELLED: 'neutral',
  REJECTED: 'danger',
  ABSENT: 'danger',
  SUSPENDED: 'danger',
  TERMINATED: 'danger',
  LATE: 'warning',
  HALF_DAY: 'warning',
  ON_LEAVE: 'purple',
  HOLIDAY: 'info',
  WEEK_OFF: 'neutral',
  LOCKED: 'danger',
  PROCESSED: 'success',
  HIRED: 'success',
  WITHDRAWN: 'neutral',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={TONE_BY_STATUS[status] ?? 'neutral'} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
