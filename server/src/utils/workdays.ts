/** Days treated as weekly off when counting working days. */
export const WEEKEND_DAYS: readonly number[] = [0, 6];

export function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function todayUtc(): Date {
  return startOfUtcDay(new Date());
}

export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function differenceInDays(later: Date, earlier: Date): number {
  return Math.round((startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime()) / 86_400_000);
}

export function isWeekend(value: Date): boolean {
  return WEEKEND_DAYS.includes(value.getUTCDay());
}

/** Inclusive list of UTC dates between two dates. */
export function eachUtcDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfUtcDay(start);
  const last = startOfUtcDay(end);

  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }

  return days;
}

/** Working days in a range, excluding weekends and the supplied holiday dates. */
export function countWorkingDays(start: Date, end: Date, holidayDates: ReadonlySet<string>): number {
  return eachUtcDay(start, end).filter((day) => !isWeekend(day) && !holidayDates.has(toDateInputValue(day))).length;
}

/** Combines a YYYY-MM-DD date with an HH:MM time into a UTC timestamp. */
export function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

export function minutesBetween(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const minutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}
