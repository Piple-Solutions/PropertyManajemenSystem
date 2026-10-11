/**
 * FE-005: calendar-day helpers in LOCAL time (the property and its staff are
 * in WIB). `Date#toISOString()` is UTC, so a local-midnight `Date` serialises
 * as the PREVIOUS day in WIB; these never go through UTC.
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of the local calendar day of `d`. */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local calendar day as `YYYY-MM-DD`. */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}

/** `YYYY-MM-DD` shifted by whole days (pure calendar arithmetic, no time zone involved). */
export function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
