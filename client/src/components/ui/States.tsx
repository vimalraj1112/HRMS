import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />;
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton key={colIndex} className={cn('h-4 flex-1', colIndex === 0 && 'max-w-40')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-4 h-3 w-full" />
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)} role="status">
      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 rounded-full bg-rose-50 p-3 text-rose-500">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
