import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ApiMeta } from '@/types/api';

export interface PaginationProps {
  meta: ApiMeta | undefined;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export function Pagination({ meta, onPageChange, onLimitChange, limitOptions = [10, 20, 50, 100] }: PaginationProps) {
  if (!meta) return null;

  const { page, limit, total, totalPages, hasNext, hasPrev } = meta;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          Showing <span className="font-medium text-slate-700">{first}</span>-
          <span className="font-medium text-slate-700">{last}</span> of{' '}
          <span className="font-medium text-slate-700">{total}</span>
        </span>
        {onLimitChange ? (
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Rows per page</span>
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  {option} / page
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
