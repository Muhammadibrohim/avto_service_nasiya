/** Business timezone offset in minutes (Asia/Tashkent = UTC+5). */
export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? 300);

/** Start of the local day (in business timezone) for the given instant, returned as a UTC Date. */
export function startOfLocalDay(d = new Date()): Date {
  const local = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - TZ_OFFSET_MIN * 60000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/** YYYY-MM-DD of the instant in the business timezone. */
export function localDateKey(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

export function localHour(d = new Date()): number {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60000).getUTCHours();
}

/** Debts without an explicit due date get this many days. */
export const DEFAULT_DUE_DAYS = 7;

/**
 * Due dates are stored as UTC midnight of the local calendar day (the same form
 * `new Date("YYYY-MM-DD")` produces), so this returns that form for today + days.
 */
export function dueDateInDays(days: number, from = new Date()): Date {
  return new Date(localDateKey(addDays(from, days)));
}

/** Parses "YYYY-MM-DD" as a local business-day start. */
export function parseLocalDate(value: string): Date {
  const [y, m, day] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day) - TZ_OFFSET_MIN * 60000);
}
