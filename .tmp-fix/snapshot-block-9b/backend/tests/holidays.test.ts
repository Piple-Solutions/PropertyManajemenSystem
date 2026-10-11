import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHolidayCache, getHolidaysForYear } from '../src/services/holidayService';
import { ADMIN, authHeaders, loginAs, setupTestApp } from './helpers/app';

/**
 * Upstream is stubbed everywhere — these tests must never touch the network.
 * The fixture below is a faithful (abridged) copy of the real
 * guangrei/APIHariLibur_V2 `calendar.json`, including the three things that
 * break naive consumers: the non-date `info` key, `holiday: false`
 * observances, and `(belum pasti)` tentative markers.
 */
const UPSTREAM = {
  info: { author: 'guangrei', link: 'https://github.com/guangrei', updated: '20260924 17:05:45' },
  '2026-01-01': { description: ['Hari libur nasional'], holiday: true, summary: ['Hari Tahun Baru'] },
  '2026-02-19': { description: ['Perayaan'], holiday: false, summary: ['1 Ramadan'] },
  '2026-03-20': { description: ['Hari libur nasional'], holiday: true, summary: ['Cuti Bersama Idul Fitri'] },
  '2026-03-21': { description: ['Hari libur nasional'], holiday: true, summary: ['Hari Idul Fitri'] },
  '2026-03-24': { description: ['Hari libur nasional'], holiday: true, summary: ['Cuti Bersama Idul Fitri'] },
  '2026-08-17': { description: ['Hari libur nasional'], holiday: true, summary: ['Hari Proklamasi Kemerdekaan R.I.'] },
  '2026-12-25': { description: ['Hari libur nasional'], holiday: true, summary: ['Hari Raya Natal'] },
  '2027-03-10': { description: ['Hari libur nasional'], holiday: true, summary: ['Hari Idul Fitri (belum pasti)'] },
  '2027-12-31': { description: ['Perayaan'], holiday: false, summary: ['Malam Tahun Baru'] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubUpstream(impl: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => impl(String(input)));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('holidayService', () => {
  beforeEach(() => clearHolidayCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHolidayCache();
  });

  it('parses a year, strips the `info` key, and sorts ascending', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res = await getHolidaysForYear(2026);

    expect(res.available).toBe(true);
    expect(res.days.map((d) => d.date)).toEqual([
      '2026-01-01',
      '2026-02-19',
      '2026-03-20',
      '2026-03-21',
      '2026-03-24',
      '2026-08-17',
      '2026-12-25',
    ]);
    // `info` is not a date, so it must never surface as a holiday.
    expect(res.days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(false);
    expect(res.sourceUpdated).toBe('20260924 17:05:45');
  });

  it('only returns the requested year', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res2026 = await getHolidaysForYear(2026);
    const res2027 = await getHolidaysForYear(2027);

    expect(res2026.days.every((d) => d.date.startsWith('2026-'))).toBe(true);
    expect(res2027.days.every((d) => d.date.startsWith('2027-'))).toBe(true);
    expect(res2027.days.map((d) => d.date)).toEqual(['2027-03-10', '2027-12-31']);
  });

  it('treats holiday:false as an observance, not a day off', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res = await getHolidaysForYear(2026);
    const ramadan = res.days.find((d) => d.date === '2026-02-19');

    expect(ramadan).toBeDefined();
    expect(ramadan?.kind).toBe('observance');
    expect(res.days.find((d) => d.date === '2026-01-01')?.kind).toBe('holiday');
  });

  it('derives isCutiBersama from the name prefix', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res = await getHolidaysForYear(2026);
    const byDate = new Map(res.days.map((d) => [d.date, d]));

    expect(byDate.get('2026-03-24')?.isCutiBersama).toBe(true);
    expect(byDate.get('2026-03-20')?.isCutiBersama).toBe(true);
    expect(byDate.get('2026-03-21')?.isCutiBersama).toBe(false);
    expect(byDate.get('2026-08-17')?.isCutiBersama).toBe(false);
  });

  it('flags "(belum pasti)" entries as tentative', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res = await getHolidaysForYear(2027);

    expect(res.days.find((d) => d.date === '2027-03-10')?.isTentative).toBe(true);
    expect(res.days.find((d) => d.date === '2027-12-31')?.isTentative).toBe(false);
  });

  it('caches the parsed document so a second year costs no extra request', async () => {
    const spy = stubUpstream(() => jsonResponse(UPSTREAM));

    await getHolidaysForYear(2026);
    await getHolidaysForYear(2027);
    expect(spy).toHaveBeenCalledTimes(1);

    // Same year again is also served from cache.
    await getHolidaysForYear(2026);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('force=true bypasses the cache', async () => {
    const spy = stubUpstream(() => jsonResponse(UPSTREAM));

    await getHolidaysForYear(2026);
    await getHolidaysForYear(2026, { force: true });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns an unpublished year as an empty, available result', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const res = await getHolidaysForYear(2099);

    expect(res.available).toBe(true);
    expect(res.days).toEqual([]);
  });

  it('degrades to available:false when upstream errors', async () => {
    stubUpstream(() => jsonResponse({ error: 'boom' }, 500));
    const res = await getHolidaysForYear(2026);

    expect(res.available).toBe(false);
    expect(res.days).toEqual([]);
    expect(res.error).toMatch(/500/);
  });

  it('degrades to available:false on malformed payloads', async () => {
    stubUpstream(() => new Response('not json at all', { status: 200 }));
    const res = await getHolidaysForYear(2026);

    expect(res.available).toBe(false);
    expect(res.days).toEqual([]);
  });

  it('degrades to available:false when the network fails', async () => {
    stubUpstream(() => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const res = await getHolidaysForYear(2026);

    expect(res.available).toBe(false);
    expect(res.error).toMatch(/unreachable/i);
  });

  it('does not cache a failure, so the next call retries upstream', async () => {
    let calls = 0;
    const spy = stubUpstream(() => {
      calls += 1;
      return calls === 1 ? jsonResponse({ error: 'down' }, 503) : jsonResponse(UPSTREAM);
    });

    const first = await getHolidaysForYear(2026);
    expect(first.available).toBe(false);

    const second = await getHolidaysForYear(2026);
    expect(second.available).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/public/holidays', () => {
  beforeEach(() => clearHolidayCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHolidayCache();
  });

  it('returns holidays without authentication', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const { app, env } = setupTestApp();

    const res = await app.request('/api/public/holidays?year=2026', {}, env);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { year: number; days: Array<{ date: string }> } };
    expect(json.data.year).toBe(2026);
    expect(json.data.days.length).toBeGreaterThan(0);
  });

  it('rejects an out-of-range year with 422', async () => {
    const { app, env } = setupTestApp();

    const res = await app.request('/api/public/holidays?year=1999', {}, env);

    expect(res.status).toBe(422);
    const json = (await res.json()) as { errors?: Record<string, string[]> };
    expect(json.errors?.year).toBeDefined();
  });

  it('rejects a missing year with 422', async () => {
    const { app, env } = setupTestApp();

    const res = await app.request('/api/public/holidays', {}, env);

    expect(res.status).toBe(422);
  });

  it('still returns 200 when upstream is down', async () => {
    stubUpstream(() => jsonResponse({ error: 'down' }, 502));
    const { app, env } = setupTestApp();

    const res = await app.request('/api/public/holidays?year=2026', {}, env);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { available: boolean; days: unknown[] } };
    expect(json.data.available).toBe(false);
    expect(json.data.days).toEqual([]);
  });

  it('honours the HOLIDAY_SOURCE_URL override', async () => {
    const spy = stubUpstream(() => jsonResponse(UPSTREAM));
    const { app, env } = setupTestApp();

    await app.request('/api/public/holidays?year=2026', {}, {
      ...env,
      HOLIDAY_SOURCE_URL: 'https://example.test/holidays.json',
    });

    expect(spy).toHaveBeenCalledWith('https://example.test/holidays.json', expect.anything());
  });

  it('does not leak data across authenticated routes', async () => {
    stubUpstream(() => jsonResponse(UPSTREAM));
    const { app, env } = setupTestApp();
    const token = await loginAs(app, env, ADMIN.email, ADMIN.password);

    const res = await app.request('/api/reservations/calendar?from=2026-01-01&to=2026-02-01', {
      headers: authHeaders(token),
    }, env);

    expect(res.status).toBe(200);
  });
});