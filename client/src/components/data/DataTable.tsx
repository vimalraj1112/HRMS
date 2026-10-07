import type { ReactNode } from 'react';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  toolbar?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  isFetching = false,
  error,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your filters or search term.',
  emptyAction,
  onRetry,
  onRowClick,
  footer,
  toolbar,
}: DataTableProps<T>) {
  if (isLoading) return <TableSkeleton rows={6} columns={columns.length} />;

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'We could not load this list.'}
        onRetry={onRetry}
      />
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div>
      {toolbar ? <div className="border-b border-slate-200 px-5 py-3">{toolbar}</div> : null}

      <div className="relative overflow-x-auto">
        {isFetching ? <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-500" aria-hidden /> : null}
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('whitespace-nowrap px-5 py-2.5 font-semibold', column.headerClassName, column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn('text-slate-700', onRowClick && 'cursor-pointer hover:bg-slate-50')}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-5 py-3 align-middle', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footer}
    </div>
  );
}
