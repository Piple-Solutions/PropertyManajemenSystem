import { apiFetch } from './api';

/**
 * Indonesian public holidays (libur nasional) for a given year.
 *
 * Served by the backend proxy (`GET /api/public/holidays`) which normalizes
 * the upstream third-party dataset ONCE and caches it. The browser therefore
 * never parses upstream data, and an upstream outage degrades to an empty list
 * instead of breaking the calendar.
 *
 * `kind` mirrors the upstream `holiday` flag:
 * - `holiday`     -> a national day off
 * - `observance`  -> a notable observance, NOT a day off (e.g. "1 Ramadan")
 *
 * `isCutiBersama` / `isTentative` are derived server-side (the upstream feed
 * encodes cuti bersama only as a "Cuti Bersama ..." name prefix, and marks
 * unconfirmed future dates "(belum pasti)").
 */
export type HolidayKind = 'holiday' | 'observance';

export interface HolidayDay {
  /** ISO calendar day, YYYY-MM-DD. */
  date: string;
  name: string;
  kind: HolidayKind;
  isCutiBersama: boolean;
  isTentative: boolean;
}

export interface HolidayYear {
  year: number;
  /** Ascending by `date`. Empty when the year is unpublished or upstream failed. */
  days: HolidayDay[];
  /** True when upstream was reached and parsed; false on any failure. */
  available: boolean;
  source: string;
  sourceUpdated?: string;
  fetchedAt: string;
  error?: string;
}

interface HolidaysResponse {
  data: HolidayYear;
}

class HolidayService {
  /**
   * Holidays for one year. Resolves to an empty list on any failure — the
   * calendar must still render reservations when holidays are unavailable.
   */
  async getForYear(year: number, options: { force?: boolean } = {}): Promise<HolidayDay[]> {
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (options.force) params.set('force', 'true');
      const json = await apiFetch<{ data: HolidayYear }>(`/api/public/holidays?${params}`, {
        auth: false,
      });
      return json.data.days ?? [];
    } catch {
      return [];
    }
  }

  /** Full payload — lets callers distinguish "no data" from "upstream down". */
  async getYear(year: number, options: { force?: boolean } = {}): Promise<HolidayYear | null> {
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (options.force) params.set('force', 'true');
      const json = await apiFetch<HolidaysResponse>(`/api/public/holidays?${params}`, { auth: false });
      return json.data;
    } catch {
      return null;
    }
  }

  /** Index a year's holidays by `YYYY-MM-DD` for O(1) day lookups. */
  toDateMap(days: HolidayDay[]): Map<string, HolidayDay> {
    return new Map(days.map((d) => [d.date, d]));
  }
}

export const holidayService = new HolidayService();
export default holidayService;