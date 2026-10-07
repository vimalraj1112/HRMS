import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)} {...props} />;
}

interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, description, action, className, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4', className)} {...props}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3', className)} {...props} />;
}
