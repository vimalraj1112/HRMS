import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Breadcrumb {
  label: string;
  to?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 ? <span className="text-slate-300">/</span> : null}
                {crumb.to ? (
                  <a href={crumb.to} className="hover:text-brand-600">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="font-medium text-slate-600">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
