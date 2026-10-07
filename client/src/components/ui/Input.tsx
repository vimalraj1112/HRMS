import { AlertCircle } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftSlot, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {leftSlot ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leftSlot}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(fieldBase, leftSlot && 'pl-9', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100', className)}
          {...props}
        />
      </div>
      {error ? <FieldError message={error} /> : hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, className, id, ...props },
  ref,
) {
  const selectId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'appearance-none bg-white pr-8', error && 'border-rose-400', className)}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <FieldError message={error} /> : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, ...props },
  ref,
) {
  const textareaId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'min-h-24 resize-y', error && 'border-rose-400', className)}
        {...props}
      />
      {error ? <FieldError message={error} /> : null}
    </div>
  );
});

export function FieldError({ message }: { message: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
