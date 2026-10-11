/**
 * Business-day helpers (BE-026). The property and its users are in
 * Asia/Jakarta (WIB, UTC+7, no daylight saving), while a Worker runs in UTC:
 * `new Date().toISOString().slice(0, 10)` is the PREVIOUS day between 00:00
 * and 07:00 WIB. Stored dates stay plain `YYYY-MM-DD` strings and stored
 * timestamps stay UTC ISO; only "what day is it now" goes through here.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the Asia/Jakarta calendar day containing `now`. */
export function todayInJakarta(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Four-digit year of the Asia/Jakarta calendar day containing `now`. */
export function yearInJakarta(now: Date = new Date()): number {
  return Number(todayInJakarta(now).slice(0, 4));
}
