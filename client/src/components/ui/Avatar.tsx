import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
} as const;

export function Avatar({
  src,
  fallback,
  size = 'md',
  className,
}: {
  src?: string | null;
  fallback: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-slate-200', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700',
        SIZES[size],
        className,
      )}
    >
      {fallback}
    </span>
  );
}
