import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

let ctx: TestContext;
let adminToken: string;
let staffToken: string;
beforeEach(async () => {
  ctx = setupTestApp();
  adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staffToken = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

function newType(overrides: Record<string, unknown> = {}) {
  return {
    name: `Type ${Math.random().toString(36).slice(2, 7)}`,
    description: 'A test room type',
    capacity: 2,
    facilities: ['WiFi', 'TV'],
    defaultRate: 500000,
    images: [],
    status: 'active',
    ...overrides,
  };
}

function newRoom(overrides: Record<string, unknown> = {}) {
  return {
    roomNumber: `9${Math.floor(Math.random() * 900 + 100)}`,
    roomTypeId: 'room-type-001',
    status: 'active',
    ...overrides,
  };
}

describe('migration 0003_phase3_rooms.sql', () => {
  it('creates room_types and rooms with constraints', async () => {
    const tables = ctx.sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ n: string }>;
    const names = tables.map((t) => t.n);
    expect(names).toContain('room_types');
    expect(names).toContain('rooms');
  });

  it('enforces unique names/numbers, checks, and FK', () => {
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO room_types (id, name, description, capacity, facilities, default_rate, images, status, created_at, updated_at) VALUES ('t1','Standard','d',2,'[]',100,'[]','active','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO rooms (id, room_number, room_type_id, status, created_at, updated_at) VALUES ('r1','101','room-type-001','active','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO room_types (id, name, description, capacity, facilities, default_rate, images, status, created_at, updated_at) VALUES ('t9','X','d',0,'[]',100,'[]','active','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO room_types (id, name, description, capacity, facilities, default_rate, images, status, created_at, updated_at) VALUES ('t9','X','d',2,'[]',0,'[]','active','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO rooms (id, room_number, room_type_id, status, created_at, updated_at) VALUES ('r9','999','nope','active','t','t')",
        )
        .run(),
    ).toThrow();
  });
});

describe('seed Phase 3', () => {
  it('seeds 5 room types and 8 rooms with parsed arrays', async () => {
    const types = await ctx.app.request('/api/room-types?page=1&pageSize=20', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(types.status).toBe(200);
    const tJson = (await types.json()) as { data: Array<Record<string, unknown>>; pagination: { total: number } };
    expect(tJson.pagination.total).toBe(5);
    const std = tJson.data.find((t) => t.id === 'room-type-001') as Record<string, unknown>;
    expect(std.name).toBe('Standard');
    expect(std.facilities).toEqual(['WiFi', 'TV', 'Air Conditioning', 'Mini Fridge']);
    expect(std.defaultRate).toBe(750000);

    const rooms = await ctx.app.request('/api/rooms?page=1&pageSize=20', { headers: jsonHeaders(adminToken) }, ctx.env);
    const rJson = (await rooms.json()) as { pagination: { total: number } };
    expect(rJson.pagination.total).toBe(8);
  });
});

describe('GET /api/room-types', () => {
  it('requires authentication (401)', async () => {
    const res = await ctx.app.request('/api/room-types', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('lists with search + status filters', async () => {
    const all = await ctx.app.request('/api/room-types?page=1&pageSize=20', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await all.json()) as { pagination: { total: number } }).pagination.total).toBe(5);

    const search = await ctx.app.request('/api/room-types?search=standard', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await search.json()) as { pagination: { total: number } }).pagination.total).toBe(1);

    const inactive = await ctx.app.request('/api/room-types?status=inactive', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await inactive.json()) as { pagination: { total: number } }).pagination.total).toBe(0);
  });

  it('returns 404 for unknown ids', async () => {
    const res = await ctx.app.request('/api/room-types/nope', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(404);
  });
});

describe('POST/PATCH/DELETE /api/room-types', () => {
  it('creates, updates, toggles status, and deletes an unused type', async () => {
    const created = await ctx.app.request('/api/room-types', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify(newType({ name: 'Deluxe Test' })),
    }, ctx.env);
    expect(created.status).toBe(201);
    const { id } = ((await created.json()) as { data: { id: string } }).data;

    const dup = await ctx.app.request('/api/room-types', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify(newType({ name: 'Deluxe Test' })),
    }, ctx.env);
    expect(dup.status).toBe(409);

    const patched = await ctx.app.request(`/api/room-types/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ capacity: 3, facilities: ['WiFi'] }),
    }, ctx.env);
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { data: { capacity: number; facilities: string[] } }).data).toMatchObject({
      capacity: 3,
      facilities: ['WiFi'],
    });

    const toggled = await ctx.app.request(`/api/room-types/${id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'inactive' }),
    }, ctx.env);
    expect(toggled.status).toBe(200);
    expect(((await toggled.json()) as { data: { status: string } }).data.status).toBe('inactive');

    const del = await ctx.app.request(`/api/room-types/${id}`, {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(del.status).toBe(204);
  });

  it('validates input with 422 + field errors', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['short name', newType({ name: 'A' })],
      ['empty description', newType({ description: '' })],
      ['zero capacity', newType({ capacity: 0 })],
      ['zero rate', newType({ defaultRate: 0 })],
    ];
    for (const [name, body] of cases) {
      const res = await ctx.app.request('/api/room-types', {
        method: 'POST',
        headers: jsonHeaders(adminToken),
        body: JSON.stringify(body),
      }, ctx.env);
      expect(res.status, name).toBe(422);
      expect(((await res.json()) as { errors: object }).errors, name).toBeDefined();
    }
  });

  it('refuses to delete a type still used by rooms (409)', async () => {
    const res = await ctx.app.request('/api/room-types/room-type-001', {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('enforces room.* permissions (staff read-only, viewer read-only)', async () => {
    const denied = await ctx.app.request('/api/room-types', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newType()),
    }, ctx.env);
    expect(denied.status).toBe(403);

    const created = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Viewer', email: 'viewer@hotel.com', password: 'viewer123', roles: ['role-004'] }),
    }, ctx.env);
    expect(created.status).toBe(201);
    const viewerToken = await loginAs(ctx.app, ctx.env, 'viewer@hotel.com', 'viewer123');
    const read = await ctx.app.request('/api/room-types', { headers: jsonHeaders(viewerToken) }, ctx.env);
    expect(read.status).toBe(200);
    const write = await ctx.app.request('/api/room-types', {
      method: 'POST',
      headers: jsonHeaders(viewerToken),
      body: JSON.stringify(newType()),
    }, ctx.env);
    expect(write.status).toBe(403);
  });
});

describe('GET /api/rooms', () => {
  it('lists with search, status, and roomTypeId filters', async () => {
    const all = await ctx.app.request('/api/rooms?page=1&pageSize=20', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await all.json()) as { pagination: { total: number } }).pagination.total).toBe(8);

    const search = await ctx.app.request('/api/rooms?search=101', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await search.json()) as { pagination: { total: number } }).pagination.total).toBe(1);

    const maint = await ctx.app.request('/api/rooms?status=maintenance', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await maint.json()) as { pagination: { total: number } }).pagination.total).toBe(1);

    const byType = await ctx.app.request('/api/rooms?roomTypeId=room-type-001', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await byType.json()) as { pagination: { total: number } }).pagination.total).toBe(2);
  });
});

describe('POST/PATCH/DELETE /api/rooms', () => {
  it('creates, updates, toggles status, and deletes an unreferenced room', async () => {
    const created = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify(newRoom({ roomNumber: '501' })),
    }, ctx.env);
    expect(created.status).toBe(201);
    const { id } = ((await created.json()) as { data: { id: string } }).data;

    const dup = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify(newRoom({ roomNumber: '501' })),
    }, ctx.env);
    expect(dup.status).toBe(409);

    const badType = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify(newRoom({ roomNumber: '502', roomTypeId: 'nope' })),
    }, ctx.env);
    expect(badType.status).toBe(409);

    const patched = await ctx.app.request(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'maintenance' }),
    }, ctx.env);
    expect(patched.status).toBe(200);

    const del = await ctx.app.request(`/api/rooms/${id}`, {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(del.status).toBe(204);
  });

  it('validates input with 422 + field errors', async () => {
    const empty = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roomNumber: '', roomTypeId: 'room-type-001' }),
    }, ctx.env);
    expect(empty.status).toBe(422);
  });

  it('refuses to delete a room with reservation history (409)', async () => {
    const res = await ctx.app.request('/api/rooms/room-001', {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('enforces room.* permissions on rooms', async () => {
    const denied = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newRoom()),
    }, ctx.env);
    expect(denied.status).toBe(403);
  });
});

describe('GET /api/public/room-types', () => {
  it('is public and returns active types only', async () => {
    const res = await ctx.app.request('/api/public/room-types', {}, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ status: string }> };
    expect(json.data.length).toBe(5);
    expect(json.data.every((t) => t.status === 'active')).toBe(true);
  });
});

describe('reservation roomId compatibility (Phase 3)', () => {
  it('rejects unknown roomIds on create and update with 422', async () => {
    const create = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({
        guestName: 'Ghost Guest',
        source: 'direct',
        checkInDate: '2026-11-01',
        checkOutDate: '2026-11-03',
        notes: '',
        rooms: [{ roomId: 'room-999', roomNumber: '999', roomTypeName: 'Ghost' }],
        pricing: {
          mode: 'same',
          nightlyRates: [
            { date: '2026-11-01', rate: 100000 },
            { date: '2026-11-02', rate: 100000 },
          ],
          paymentType: 'no_dp',
          dpType: 'percentage',
        },
      }),
    }, ctx.env);
    expect(create.status).toBe(422);

    const update = await ctx.app.request('/api/reservations/res-001', {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ rooms: [{ roomId: 'room-999', roomNumber: '999', roomTypeName: 'Ghost' }] }),
    }, ctx.env);
    expect(update.status).toBe(422);
  });

  it('preserves snapshots: room/type edits never rewrite reservation history', async () => {
    const before = await ctx.app.request('/api/reservations/res-001', { headers: jsonHeaders(staffToken) }, ctx.env);
    const beforeRooms = ((await before.json()) as { data: { rooms: Array<{ roomNumber: string; roomTypeName: string }> } }).data.rooms;

    await ctx.app.request('/api/rooms/room-001', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roomNumber: '199' }),
    }, ctx.env);
    await ctx.app.request('/api/room-types/room-type-001', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Renamed' }),
    }, ctx.env);

    const after = await ctx.app.request('/api/reservations/res-001', { headers: jsonHeaders(staffToken) }, ctx.env);
    const afterRooms = ((await after.json()) as { data: { rooms: Array<{ roomNumber: string; roomTypeName: string }> } }).data.rooms;
    expect(afterRooms).toEqual(beforeRooms);
  });
});
