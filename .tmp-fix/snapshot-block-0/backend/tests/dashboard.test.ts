import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createD1Db } from '../src/db/client';
import { getDashboardOverview } from '../src/services/dashboardService';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { applyMigrationFile, backendRoot, createSqlite, fakeD1 } from './helpers/fake-d1';

let ctx: TestContext;
let adminToken: string;
let staffToken: string;
beforeEach(async () => {
  ctx = setupTestApp();
  adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staffToken = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

interface Overview {
  today: string;
  reservations: {
    total: number;
    todayCheckins: number;
    upcoming: number;
    checkedIn: number;
    byStatus: Record<string, number>;
  };
  rooms: { total: number; active: number; maintenance: number; inactive: number };
  occupancy: { checkedIn: number; totalRooms: number; rate: number };
  recent: Array<{
    id: string;
    reservationCode: string;
    guestName: string;
    source: string;
    checkInDate: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
}

async function getOverview(token: string): Promise<Overview> {
  const res = await ctx.app.request('/api/dashboard/overview', { headers: jsonHeaders(token) }, ctx.env);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Overview }).data;
}

/** UTC calendar day — same basis as the server's `today`. */
function utcToday(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function newStay(checkIn: string, checkOut: string, roomId: string, roomNumber: string, overrides: Record<string, unknown> = {}) {
  const nights: Array<{ date: string; rate: number }> = [];
  for (let d = new Date(`${checkIn}T00:00:00Z`); d < new Date(`${checkOut}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    nights.push({ date: d.toISOString().slice(0, 10), rate: 500000 });
  }
  return {
    guestName: 'Dashboard Guest',
    source: 'direct',
    checkInDate: checkIn,
    checkOutDate: checkOut,
    notes: '',
    rooms: [{ roomId, roomNumber, roomTypeName: 'Standard' }],
    pricing: { mode: 'same', nightlyRates: nights, paymentType: 'no_dp', dpType: 'percentage', dpPercentage: 0 },
    ...overrides,
  };
}

/** Pick a room with no overlapping bookings for the range (deterministic, no flakes). */
async function freeRoomFor(token: string, checkIn: string, checkOut: string): Promise<{ id: string; roomNumber: string }> {
  const avail = await ctx.app.request(
    `/api/reservations/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
    { headers: jsonHeaders(token) },
    ctx.env,
  );
  expect(avail.status).toBe(200);
  const booked = ((await avail.json()) as { data: { bookedRoomIds: string[] } }).data.bookedRoomIds;
  const roomsRes = await ctx.app.request('/api/rooms?page=1&pageSize=100', { headers: jsonHeaders(token) }, ctx.env);
  const all = ((await roomsRes.json()) as { data: Array<{ id: string; roomNumber: string }> }).data;
  const free = all.find((r) => !booked.includes(r.id));
  expect(free, `no free room for ${checkIn}..${checkOut}`).toBeDefined();
  return free as { id: string; roomNumber: string };
}

describe('GET /api/dashboard/overview', () => {
  it('requires authentication (401)', async () => {
    const res = await ctx.app.request('/api/dashboard/overview', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('requires reservation.view or room.view (403 otherwise)', async () => {
    const role = await ctx.app.request('/api/roles', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'UsersOnly', permissions: ['user.view'] }),
    }, ctx.env);
    expect(role.status).toBe(201);
    const roleId = ((await role.json()) as { data: { id: string } }).data.id;
    const created = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Limited', email: 'limited@hotel.com', password: 'limited123', roles: [roleId] }),
    }, ctx.env);
    expect(created.status).toBe(201);
    const token = await loginAs(ctx.app, ctx.env, 'limited@hotel.com', 'limited123');
    const denied = await ctx.app.request('/api/dashboard/overview', { headers: jsonHeaders(token) }, ctx.env);
    expect(denied.status).toBe(403);

    // Staff (reservation.view + room.view) and admin both succeed.
    expect((await ctx.app.request('/api/dashboard/overview', { headers: jsonHeaders(staffToken) }, ctx.env)).status).toBe(200);
    expect((await ctx.app.request('/api/dashboard/overview', { headers: jsonHeaders(adminToken) }, ctx.env)).status).toBe(200);
  });

  it('returns today as the server UTC date (not hardcoded)', async () => {
    const ov = await getOverview(adminToken);
    expect(ov.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ov.today).toBe(utcToday());
  });

  it('matches seeded reservation/room aggregates and formulas', async () => {
    const ov = await getOverview(adminToken);
    expect(ov.reservations.total).toBe(15);
    expect(ov.reservations.byStatus).toEqual({ reserved: 8, 'checked-in': 2, 'checked-out': 3, cancelled: 2 });
    expect(Object.values(ov.reservations.byStatus).reduce((a, b) => a + b, 0)).toBe(ov.reservations.total);
    expect(ov.rooms).toEqual({ total: 8, active: 6, maintenance: 1, inactive: 1 });
    expect(ov.occupancy).toEqual({ checkedIn: 2, totalRooms: 8, rate: Math.round((2 / 8) * 100) });
    expect(ov.occupancy.rate).toBe(25);
  });

  it('returns the 5 newest reservations with table fields, newest first', async () => {
    const { recent } = await getOverview(adminToken);
    expect(recent).toHaveLength(5);
    for (const r of recent) {
      for (const key of ['id', 'reservationCode', 'guestName', 'source', 'checkInDate', 'status', 'totalAmount', 'createdAt']) {
        expect(r, key).toHaveProperty(key);
      }
    }
    const createdAts = recent.map((r) => r.createdAt);
    expect([...createdAts].sort().reverse()).toEqual(createdAts);

    const seed = JSON.parse(
      readFileSync(resolve(backendRoot, '..', 'frontend', 'src', 'data', 'mock', 'reservations.json'), 'utf8'),
    ) as Array<{ id: string; createdAt: string }>;
    const expected = [...seed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5).map((r) => r.id);
    expect(recent.map((r) => r.id)).toEqual(expected);
  });

  it('counts a today check-in as today (not upcoming) at the date boundary', async () => {
    const today = utcToday();
    const tomorrow = utcToday(1);
    const before = await getOverview(staffToken);
    const room = await freeRoomFor(staffToken, today, tomorrow);
    const created = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay(today, tomorrow, room.id, room.roomNumber)),
    }, ctx.env);
    expect(created.status).toBe(201);
    const after = await getOverview(staffToken);
    expect(after.reservations.todayCheckins).toBe(before.reservations.todayCheckins + 1);
    // Boundary: checkInDate === today is NOT upcoming (strict `>`).
    expect(after.reservations.upcoming).toBe(before.reservations.upcoming);
    expect(after.reservations.total).toBe(before.reservations.total + 1);
    expect(after.recent[0].checkInDate).toBe(today);
  });

  it('counts future reserved stays as upcoming; cancelled stays excluded', async () => {
    const start = utcToday(10);
    const end = utcToday(12);
    const before = await getOverview(staffToken);
    const room = await freeRoomFor(staffToken, start, end);
    const created = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay(start, end, room.id, room.roomNumber)),
    }, ctx.env);
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    const mid = await getOverview(staffToken);
    expect(mid.reservations.upcoming).toBe(before.reservations.upcoming + 1);

    const cancelled = await ctx.app.request(`/api/reservations/${id}/cancel`, {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(cancelled.status).toBe(200);
    const after = await getOverview(staffToken);
    // Cancelled future stay leaves upcoming; total + cancelled move.
    expect(after.reservations.upcoming).toBe(before.reservations.upcoming);
    expect(after.reservations.total).toBe(before.reservations.total + 1);
    expect(after.reservations.byStatus.cancelled).toBe(before.reservations.byStatus.cancelled + 1);
  });

  it('reflects check-in transitions in occupancy and counts', async () => {
    const start = utcToday(20);
    const end = utcToday(22);
    const before = await getOverview(staffToken);
    const room = await freeRoomFor(staffToken, start, end);
    const created = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay(start, end, room.id, room.roomNumber)),
    }, ctx.env);
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    const checkin = await ctx.app.request(`/api/reservations/${id}/check-in`, {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(checkin.status).toBe(200);
    const after = await getOverview(staffToken);
    expect(after.reservations.checkedIn).toBe(before.reservations.checkedIn + 1);
    expect(after.occupancy.checkedIn).toBe(before.occupancy.checkedIn + 1);
    expect(after.occupancy.rate).toBe(Math.round((after.occupancy.checkedIn / after.occupancy.totalRooms) * 100));
  });
});

describe('dashboard aggregation on empty data', () => {
  it('returns zeros with rate 0 and an empty recent list', async () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    applyMigrationFile(sqlite, '0003_phase3_rooms.sql');
    applyMigrationFile(sqlite, '0004_phase4_activities.sql');
    const db = createD1Db(fakeD1(sqlite) as unknown as D1Database);
    const ov = await getDashboardOverview(db);
    expect(ov.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ov.reservations).toEqual({
      total: 0,
      todayCheckins: 0,
      upcoming: 0,
      checkedIn: 0,
      byStatus: { reserved: 0, 'checked-in': 0, 'checked-out': 0, cancelled: 0 },
    });
    expect(ov.rooms).toEqual({ total: 0, active: 0, maintenance: 0, inactive: 0 });
    expect(ov.occupancy).toEqual({ checkedIn: 0, totalRooms: 0, rate: 0 });
    expect(ov.recent).toEqual([]);
  });
});
