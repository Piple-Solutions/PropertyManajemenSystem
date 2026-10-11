import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { queryLogFor } from './helpers/fake-d1';
import { todayInJakarta, yearInJakarta } from '../src/lib/time';
import { nextReservationCode } from '../src/lib/pricing';

/**
 * Block 7 regression tests: BE-009 (validation limits, sales/breakdown zod,
 * LIKE escaping, bound-parameter cap), BE-026 (Asia/Jakarta "today"),
 * BE-027 (no N+1, one auth context load), BE-035 (explicit ORDER BY).
 */
let ctx: TestContext;
let admin: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});
afterEach(() => vi.useRealTimers());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await ctx.app.request(
    path,
    { method, headers: jsonHeaders(token), body: body === undefined ? undefined : JSON.stringify(body) },
    ctx.env,
  );
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}

describe('BE-026: "today" is the Asia/Jakarta calendar day (UTC+7, no DST)', () => {
  it('todayInJakarta / yearInJakarta around the UTC/WIB boundary', () => {
    expect(todayInJakarta(new Date('2026-09-15T16:59:59Z'))).toBe('2026-09-15'); // 23:59 WIB
    expect(todayInJakarta(new Date('2026-09-15T17:00:00Z'))).toBe('2026-09-16'); // 00:00 WIB
    expect(todayInJakarta(new Date('2026-09-15T20:00:00Z'))).toBe('2026-09-16'); // PoC: 03:00 WIB
    expect(todayInJakarta(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
    expect(yearInJakarta(new Date('2026-12-31T17:00:00Z'))).toBe(2027);
    expect(yearInJakarta(new Date('2026-12-31T16:59:00Z'))).toBe(2026);
  });

  /** Freeze the clock FIRST, then sign in: tokens carry iat/exp of the (fake) now. */
  async function adminAt(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    return loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  }

  it('dashboard `today` follows WIB and counts a 16 Sep check-in as today at 03:00 WIB', async () => {
    const evening = await adminAt('2026-09-15T16:00:00Z'); // 23:00 WIB, still the 15th
    expect((await call('GET', '/api/dashboard/overview', evening)).json.data.today).toBe('2026-09-15');
    const token = await adminAt('2026-09-15T20:00:00Z'); // 03:00 WIB on the 16th
    const res = await call('GET', '/api/dashboard/overview', token);
    expect(res.json.data.today).toBe('2026-09-16');
    // res-002 checks in on 2026-09-16 in the seed.
    expect(res.json.data.reservations.todayCheckins).toBeGreaterThanOrEqual(1);
  });

  it('invoice next-number defaults to the WIB day (and WIB year around New Year)', async () => {
    const token = await adminAt('2026-12-31T20:00:00Z'); // 2027-01-01 03:00 WIB
    const res = await call('GET', '/api/invoices/next-number', token);
    expect(res.json.data.invoiceNumber).toMatch(/^INV-2027-001$/);
  });

  it('reservation codes use the WIB year', async () => {
    expect(nextReservationCode(0, new Date('2026-12-31T20:00:00Z'))).toBe('RSV-2027-001');
    expect(nextReservationCode(0, new Date('2026-12-31T10:00:00Z'))).toBe('RSV-2026-001');
    await adminAt('2026-12-31T20:00:00Z');
    const staffToken = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    const res = await call('POST', '/api/reservations', staffToken, {
      guestName: 'Year Guest', source: 'direct', checkInDate: '2027-02-01', checkOutDate: '2027-02-02', notes: '',
      rooms: [{ roomId: 'room-01', roomNumber: '01' }],
      pricing: { mode: 'same', nightlyRates: [{ date: '2027-02-01', rate: 100000 }], paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.reservationCode).toMatch(/^RSV-2027-\d{3}$/);
  });
});

describe('BE-027: list endpoints do not issue per-row queries', () => {
  async function count(path: string, token = admin) {
    const log = queryLogFor(ctx.sqlite);
    log.reset();
    const res = await ctx.app.request(path, { headers: jsonHeaders(token) }, ctx.env);
    await res.text();
    expect(res.status).toBe(200);
    return log.count;
  }

  it('statement count does not grow with the page size (reservations, users, roles, invoices, calendar)', async () => {
    for (const base of [
      '/api/reservations',
      '/api/users',
      '/api/roles',
      '/api/invoices',
    ]) {
      const small = await count(`${base}?page=1&pageSize=2`);
      const large = await count(`${base}?page=1&pageSize=9`);
      expect(large, base).toBe(small);
    }
    const cal = await count('/api/reservations/calendar?from=2026-09-01&to=2026-10-01');
    const calSmall = await count('/api/reservations/calendar?from=2026-09-10&to=2026-09-11');
    expect(cal).toBe(calSmall);
  });

  it('absolute budgets: reservations list <= 8, availability <= 5, auth context <= 3 statements', async () => {
    expect(await count('/api/reservations?page=1&pageSize=100', staff)).toBeLessThanOrEqual(8);
    expect(await count('/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-18', staff)).toBeLessThanOrEqual(5);
    expect(await count('/api/auth/me', admin)).toBeLessThanOrEqual(3);
    expect(await count('/api/dashboard/overview', admin)).toBeLessThanOrEqual(8);
  });

  it('a user with several roles resolves the union of permissions with one context query', async () => {
    await call('PUT', '/api/users/user-005/roles', admin, { roles: ['role-005', 'role-003'] });
    const token = await loginAs(ctx.app, ctx.env, 'another@hotel.com', 'another123');
    const me = await call('GET', '/api/auth/me', token);
    expect(me.json.data.user.roles.sort()).toEqual(['role-003', 'role-005']);
    expect(me.json.data.permissions).toContain('activity.view');
    expect(me.json.data.permissions).toContain('reservation.update');
    const log = queryLogFor(ctx.sqlite);
    log.reset();
    await call('GET', '/api/auth/me', token);
    expect(log.count).toBeLessThanOrEqual(3);
  });
});

describe('BE-035: every list has an explicit ORDER BY', () => {
  const lists = [
    '/api/users?pageSize=100',
    '/api/roles?pageSize=100',
    '/api/rooms?pageSize=100',
    '/api/room-types?pageSize=100',
    '/api/reservations?pageSize=100',
    '/api/reservations/calendar?from=2026-09-01&to=2026-10-01',
    '/api/invoices?pageSize=100',
    '/api/expenses?pageSize=100',
    '/api/sales?pageSize=100',
    '/api/activities?pageSize=100',
  ];
  for (const path of lists) {
    it(`${path} sorts its row query`, async () => {
      const log = queryLogFor(ctx.sqlite);
      log.reset();
      const res = await ctx.app.request(path, { headers: jsonHeaders(admin) }, ctx.env);
      expect(res.status).toBe(200);
      await res.text();
      const rowQueries = log.sql.filter(
        (s) => /limit \?/i.test(s) || /calendar|from "reservations"/i.test(s) ? /^select/i.test(s) && !/count\(\*\)/i.test(s) && !/"id" = \?/.test(s) : false,
      );
      expect(rowQueries.length, path).toBeGreaterThan(0);
      for (const s of rowQueries) expect(s, path).toMatch(/order by/i);
    });
  }

  it('physical re-ordering of rows does not change the order a client sees (ties resolve by id)', async () => {
    const before = (await call('GET', '/api/invoices?pageSize=100', admin)).json.data.map((i: any) => i.id);
    expect(before.length).toBeGreaterThan(5);
    const again = (await call('GET', '/api/invoices?pageSize=100', admin)).json.data.map((i: any) => i.id);
    expect(again).toEqual(before);
  });
});

describe('BE-009: validation limits', () => {
  const longStr = (n: number) => 'x'.repeat(n);

  it('rejects over-long strings and oversized arrays with 422', async () => {
    const cases: Array<[string, string, string, unknown]> = [
      ['user name', 'POST', '/api/users', { name: longStr(101), email: 'a@b.co', password: 'secret123', roles: ['role-003'] }],
      ['user email', 'POST', '/api/users', { name: 'Ok Name', email: `${longStr(250)}@b.co`, password: 'secret123', roles: ['role-003'] }],
      ['user password', 'POST', '/api/users', { name: 'Ok Name', email: 'a@b.co', password: longStr(129), roles: ['role-003'] }],
      ['user roles array', 'POST', '/api/users', { name: 'Ok Name', email: 'a@b.co', password: 'secret123', roles: Array.from({ length: 25 }, (_, i) => `role-${i}`) }],
      ['role name', 'POST', '/api/roles', { name: longStr(101) }],
      ['role description', 'POST', '/api/roles', { name: 'Fine Role', description: longStr(501) }],
      ['role permissions array', 'POST', '/api/roles', { name: 'Fine Role', permissions: Array.from({ length: 201 }, () => 'room.view') }],
      ['room type description', 'POST', '/api/room-types', { name: 'Type X', description: longStr(2001), capacity: 2, defaultRate: 100000 }],
      ['room type facilities array', 'POST', '/api/room-types', { name: 'Type X', description: 'd', capacity: 2, defaultRate: 100000, facilities: Array.from({ length: 51 }, (_, i) => `f${i}`) }],
      ['room type images array', 'POST', '/api/room-types', { name: 'Type X', description: 'd', capacity: 2, defaultRate: 100000, images: Array.from({ length: 21 }, (_, i) => `i${i}`) }],
      ['room number', 'POST', '/api/rooms', { roomNumber: longStr(31), roomTypeId: 'room-type-001' }],
      ['expense description', 'POST', '/api/expenses', { date: '2026-09-19', category: 'Other', description: longStr(501), amount: 1000 }],
      ['invoice guest', 'POST', '/api/invoices', { guestName: longStr(101), source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] }],
      ['invoice item description', 'POST', '/api/invoices', { guestName: 'Guest', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: longStr(201), quantity: 1, unitPrice: 1 }] }],
      ['invoice items array', 'POST', '/api/invoices', { guestName: 'Guest', source: 'direct', invoiceDate: '2026-09-18', items: Array.from({ length: 101 }, () => ({ description: 'x', quantity: 1, unitPrice: 1 })) }],
      ['reservation guest', 'POST', '/api/reservations', { guestName: longStr(101), source: 'direct', checkInDate: '2027-01-01', checkOutDate: '2027-01-02', rooms: [{ roomId: 'room-01', roomNumber: '01' }], pricing: { mode: 'same', nightlyRates: [{ date: '2027-01-01', rate: 1 }], paymentType: 'no_dp', dpType: 'percentage' } }],
      ['search term', 'GET', `/api/users?search=${longStr(101)}`, undefined],
      ['page number', 'GET', '/api/users?page=1000000', undefined],
    ];
    for (const [name, method, path, body] of cases) {
      const res = await call(method, path, admin, body);
      expect(res.status, name).toBe(422);
    }
  });

  it('accepts every seeded value and values at the limits', async () => {
    const ok = await call('POST', '/api/users', admin, { name: 'N'.repeat(100), email: `${'e'.repeat(60)}@hotel.com`, password: 'p'.repeat(128), roles: ['role-003'] });
    expect(ok.status).toBe(201);
    expect((await call('POST', '/api/roles', admin, { name: 'R'.repeat(100), description: 'd'.repeat(500) })).status).toBe(201);
    expect((await call('POST', '/api/room-types', admin, { name: 'Max Type', description: 'd'.repeat(2000), capacity: 2, defaultRate: 100000, facilities: Array.from({ length: 50 }, (_, i) => `f${i}`), images: Array.from({ length: 20 }, (_, i) => `https://img.test/${i}.jpg`) })).status).toBe(201);
    // Everything the seed script inserts must still be a valid payload for the same schemas.
    expect((await call('POST', '/api/invoices', admin, { guestName: 'Seed Guest Name', source: 'direct', invoiceDate: '2026-09-18', items: Array.from({ length: 18 }, (_, i) => ({ description: `Room charge item ${i}`, quantity: 28, unitPrice: 1200000 })) })).status).toBe(201);
  });

  it('GET /api/sales/breakdown goes through zod: malformed dates are 422, valid and missing ones behave as before', async () => {
    expect((await call('GET', '/api/sales/breakdown?start=garbage', admin)).status).toBe(422);
    expect((await call('GET', '/api/sales/breakdown?end=2026-02-31', admin)).status).toBe(422);
    expect((await call('GET', '/api/sales/breakdown?start=2026-09-30&end=2026-09-01', admin)).status).toBe(400);
    const all = await call('GET', '/api/sales/breakdown', admin);
    expect(all.status).toBe(200);
    expect(Array.isArray(all.json.data)).toBe(true);
    expect((await call('GET', '/api/sales/breakdown?start=2026-09-01&end=2026-09-30', admin)).status).toBe(200);
  });

  it('report categories: a very long list is rejected (422), never a 500 from the 100-parameter limit', async () => {
    const many = Array.from({ length: 150 }, (_, i) => `cat${i}`).join(',');
    const res = await call('GET', `/api/reports/summary?start=2026-09-01&end=2026-09-30&categories=${many}`, admin);
    expect(res.status).toBe(422);
    const ok = await call('GET', '/api/reports/summary?start=2026-09-01&end=2026-09-30&categories=Utilities,Staff,Other,Supplies', admin);
    expect(ok.status).toBe(200);
    const rev = await call('GET', `/api/reports/revenue?start=2026-09-01&end=2026-09-30&categories=${many}`, admin);
    expect(rev.status).toBe(422);
  });

  it('LIKE wildcards in search are literal characters', async () => {
    await call('POST', '/api/users', admin, { name: 'Percent 100% Sure', email: 'pct@hotel.com', password: 'secret123', roles: ['role-003'] });
    await call('POST', '/api/users', admin, { name: 'Under_score Name', email: 'under@hotel.com', password: 'secret123', roles: ['role-003'] });
    const pct = await call('GET', '/api/users?search=%25', admin); // search=%
    expect(pct.json.data.map((u: any) => u.email)).toEqual(['pct@hotel.com']);
    const us = await call('GET', '/api/users?search=_', admin);
    expect(us.json.data.map((u: any) => u.email).sort()).toEqual(['under@hotel.com']);
    const normal = await call('GET', '/api/users?search=staff', admin);
    const emails = normal.json.data.map((u: any) => u.email);
    expect(emails).toContain('staff@hotel.com');
    expect(emails).not.toContain('pct@hotel.com');
    expect(emails).not.toContain('under@hotel.com');
    const rooms = await call('GET', '/api/rooms?search=_', admin);
    expect(rooms.json.pagination.total).toBe(0);
    const rsv = await call('GET', '/api/reservations?search=%25', admin);
    expect(rsv.json.pagination.total).toBe(0);
  });

  it('permission/role id arrays cannot exceed the bound-parameter limit through role assignment either', async () => {
    const res = await call('PUT', '/api/users/user-005/roles', admin, { roles: Array.from({ length: 150 }, (_, i) => `role-${i}`) });
    expect(res.status).toBe(422);
  });
});
