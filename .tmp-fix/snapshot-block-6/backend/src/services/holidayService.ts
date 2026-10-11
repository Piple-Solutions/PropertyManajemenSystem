import { badRequest } from '../lib/errors';

/**
 * Indonesian public holidays (libur nasional), proxied from an upstream
 * community dataset:
 *   https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.json
 *
 * Why a proxy instead of calling upstream from the browser:
 * - keeps the client on the single `${VITE_API_URL}/api` base (api.ts convention)
 * - normalizes the upstream shape ONCE so the UI never parses third-party data
 * - lets us cache (upstream is a 10 KB static file behind a CDN)
 * - a single place to degrade gracefully when upstream is down
 *
 * Upstream shape is a DATE-KEYED OBJECT, not an array:
 *   {
 *     "2026-01-01": { description: ["Hari libur nasional"], holiday: true,  summary: ["Hari Tahun Baru"] },
 *     "2026-02-19": { description: ["Perayaan"],           holiday: false, summary: ["1 Ramadan"] },
 *     "info":       { author: "guangrei", link: "...", updated: "20260924 17:05:45" }
 *   }
 *
 * TWO UPSTREAM QUIRKS THIS SERVICE ABSORBS:
 * 1. There is a non-date `info` key. Every key is therefore validated against
 *    DATE_KEY before use — without that guard `info` becomes a phantom holiday.
 * 2. `holiday: false` means OBSERVANCE ("Perayaan"), NOT a day off. Kept as a
 *    separate `kind` so the UI can de-emphasise it (e.g. "1 Ramadan").
 *
 * Cuti bersama has no boolean in this dataset — it is only encoded in the name
 * as a `"Cuti Bersama ..."` prefix, so `isCutiBersama` is a name match. The
 * richer SKB-3-Menteri feed exposes a real `is_cuti_bersama` flag; if we ever
 * migrate to it, only this derivation changes.
 */

/** Default upstream. Overridable via the `HOLIDAY_SOURCE_URL` worker var. */
export const DEFAULT_HOLIDAY_SOURCE_URL =
  'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.json';

/** Upstream is a static file behind a CDN; 6h keeps it fresh without hammering. */
export const HOLIDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Fail fast so a slow upstream can never hang a calendar render. */
const UPSTREAM_TIMEOUT_MS = 5000;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CUTI_BERSAMA_PREFIX = /^cuti\s+bersama/i;
const BELUM_PASTI = /\(belum\s+pasti\)/i;

/**
 * `holiday: true`  → a national day off (`kind: 'holiday'`).
 * `holiday: false` → an observance, still worth showing (`kind: 'observance'`).
 */
export type HolidayKind = 'holiday' | 'observance';

export interface HolidayDay {
  /** ISO calendar day, YYYY-MM-DD. */
  date: string;
  /** Human label from upstream `summary` (falls back to `description`). */
  name: string;
  kind: HolidayKind;
  /** Name begins with "Cuti Bersama" (joint leave). */
  isCutiBersama: boolean;
  /** Upstream marked the date "(belum pasti)" — e.g. all 2027 hijri dates. */
  isTentative: boolean;
}

export interface HolidayYear {
  year: number;
  /** Ascending by `date`. Empty when the year is unpublished or upstream failed. */
  days: HolidayDay[];
  /** True when upstream was reached and parsed; false on any failure. */
  available: boolean;
  source: string;
  /** Upstream `info.updated`, e.g. "20260924 17:05:45". */
  sourceUpdated?: string;
  fetchedAt: string;
  /** Present only when `available` is false. */
  error?: string;
}

interface RawEntry {
  summary?: unknown;
  description?: unknown;
  holiday?: unknown;
}

/**
 * The upstream file covers EVERY year in one document, so the parsed document
 * is cached as a whole rather than per year — navigating between two months of
 * the same year, or across 2026/2027, costs exactly one upstream request per
 * TTL window.
 */
interface DocumentCache {
  at: number;
  sourceUrl: string;
  document: ParsedDocument;
}

let documentCache: DocumentCache | null = null;

/** Test seam: clears the in-memory TTL cache between cases. */
export function clearHolidayCache(): void {
  documentCache = null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function pickName(entry: RawEntry): string {
  const summary = toStringList(entry.summary);
  if (summary.length > 0) return summary.join(' ').trim();
  const description = toStringList(entry.description);
  if (description.length > 0) return description.join(' ').trim();
  return 'Unnamed holiday';
}

function toHolidayDay(date: string, raw: unknown): HolidayDay | null {
  if (!DATE_KEY.test(date)) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as RawEntry;
  const name = pickName(entry);
  if (!name) return null;
  return {
    date,
    name,
    // Default to a day off when the flag is missing or non-boolean.
    kind: entry.holiday === false ? 'observance' : 'holiday',
    isCutiBersama: CUTI_BERSAMA_PREFIX.test(name),
    isTentative: BELUM_PASTI.test(name),
  };
}

/**
 * Fetch + parse the whole upstream document. One request serves every year
 * (the file is keyed by date), so the parsed document is cached whole and each
 * year is sliced out of it below.
 */
interface ParsedDocument {
  byYear: Map<number, HolidayDay[]>;
  sourceUpdated?: string;
}

async function fetchDocument(sourceUrl: string): Promise<ParsedDocument> {
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    : undefined;

  let res: Response;
  try {
    res = await fetch(sourceUrl, signal ? { signal } : {});
  } catch (err) {
    throw badRequest(`Holiday source unreachable: ${(err as Error)?.message ?? 'network error'}`);
  }
  if (!res.ok) {
    throw badRequest(`Holiday source responded with HTTP ${res.status}.`);
  }

  let body: unknown;
  try {
    // Upstream serves `Content-Type: text/plain`, so `.json()` is not safe to
    // rely on — parse the text body ourselves.
    body = JSON.parse(await res.text());
  } catch {
    throw badRequest('Holiday source returned a malformed payload.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Holiday source returned an unexpected payload shape.');
  }

  const byYear = new Map<number, HolidayDay[]>();
  let sourceUpdated: string | undefined;

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    // The `info` metadata object is the only non-date key upstream emits.
    if (key === 'info') {
      if (typeof value === 'object' && value !== null) {
        const updated = (value as Record<string, unknown>).updated;
        if (typeof updated === 'string' && updated.trim()) sourceUpdated = updated.trim();
      }
      continue;
    }
    const day = toHolidayDay(key, value);
    if (!day) continue;
    const year = Number(day.date.slice(0, 4));
    const bucket = byYear.get(year);
    if (bucket) bucket.push(day);
    else byYear.set(year, [day]);
  }

  for (const bucket of byYear.values()) {
    bucket.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return sourceUpdated ? { byYear, sourceUpdated } : { byYear };
}

function emptyPayload(
  year: number,
  sourceUrl: string,
  reason: string,
  sourceUpdated?: string,
): HolidayYear {
  return {
    year,
    days: [],
    available: false,
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
    error: reason,
    ...(sourceUpdated ? { sourceUpdated } : {}),
  };
}

/**
 * Holidays for one year. The parsed upstream document is cached for
 * `HOLIDAY_CACHE_TTL_MS`, so this is free after the first call.
 *
 * Upstream failures NEVER throw — the calendar must keep rendering reservations
 * when the third party is down, so failures come back as `available: false`
 * with an empty `days` array.
 */
export async function getHolidaysForYear(
  year: number,
  options: { force?: boolean; sourceUrl?: string } = {},
): Promise<HolidayYear> {
  const sourceUrl = options.sourceUrl || DEFAULT_HOLIDAY_SOURCE_URL;
  const now = Date.now();
  // Read the module-level cache into a local so TS can narrow it.
  const cached = documentCache;
  const fresh =
    !options.force &&
    cached !== null &&
    cached.sourceUrl === sourceUrl &&
    now - cached.at < HOLIDAY_CACHE_TTL_MS;

  if (fresh && cached) {
    return sliceYear(year, sourceUrl, cached.document);
  }

  let document: ParsedDocument;
  try {
    document = await fetchDocument(sourceUrl);
  } catch (err) {
    // Deliberately NOT cached: a transient upstream outage should be retried
    // on the next request rather than pinned for the full TTL.
    return emptyPayload(year, sourceUrl, err instanceof Error ? err.message : 'Unknown error');
  }

  documentCache = { at: now, sourceUrl, document };
  return sliceYear(year, sourceUrl, document);
}

function sliceYear(year: number, sourceUrl: string, document: ParsedDocument): HolidayYear {
  const payload: HolidayYear = {
    year,
    days: document.byYear.get(year) ?? [],
    available: true,
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
  if (document.sourceUpdated) payload.sourceUpdated = document.sourceUpdated;
  return payload;
}