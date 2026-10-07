import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined, currency = 'INR'): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function fullName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!person) return '—';
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || '—';
}
