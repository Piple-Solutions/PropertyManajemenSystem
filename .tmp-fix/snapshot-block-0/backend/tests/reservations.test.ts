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

function newStay(overrides: Record<string, unknown> = {}) {
  return {
    guestName: 'Test Guest',
    source: 'direct',
    checkInDate: '2026-11-01',
    checkOutDate: '2026-11-03',
    notes: '',
    rooms: [{ roomId: 'room-008', roomNumber: '401', roomTypeName: 'Family' }],
    pricing: {
      mode: 'same',
      nightlyRates: [
        { date: '2026-11-01', rate: 500000 },
        { date: '2026-11-02', rate: 500000 },
      ],
      paymentType: 'no_dp',
      dpType: 'percentage',
      dpPercentage: 30,
    },
    ...overrides,
  };
}

describe('GET /api/reservations', () => {
  it('requires authentication (401)', async () => {
    const res = await ctx.app.request('/api/reservations', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('lists all 15 seeded reservations with full shape', async () => {
    const res = await ctx.app.request('/api/reservations?page=1&pageSize=20', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(json.pagination.total).toBe(15);
    const first = json.data[0] as Record<string, unknown>;
    for (const key of ['id', 'reservationCode', 'guestName', 'source', 'checkInDate', 'checkOutDate', 'status', 'notes', 'totalAmount', 'createdAt', 'updatedAt', 'pricing', 'payment', 'calc', 'rooms']) {
      expect(first, key).toHaveProperty(key);
    }
    expect(first).not.toHaveProperty('passwordHash');
  });

  it('recomputes calc server-side (res-002: 2400000 / 720000 / 1680000)', async () => {
    const res = await ctx.app.request('/api/reservations/res-002', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { totalAmount: number; calc: { nights: number; roomTotal: number; dpAmount: number; remainingBalance: number } };
    };
    expect(json.data.totalAmount).toBe(2400000);
    expect(json.data.calc).toMatchObject({ nights: 3, roomTotal: 2400000, dpAmount: 720000, remainingBalance: 1680000 });
  });

  it('supports search, status, source, and date filters', async () => {
    const search = await ctx.app.request('/api/reservations?search=RSV-2026-002', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await search.json()) as { pagination: { total: number } }).pagination.total).toBe(1);

    const cancelled = await ctx.app.request('/api/reservations?status=cancelled', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await cancelled.json()) as { pagination: { total: number } }).pagination.total).toBe(2);

    const ota = await ctx.app.request('/api/reservations?source=ota', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await ota.json()) as { pagination: { total: number } }).pagination.total).toBe(3);

    const day = await ctx.app.request('/api/reservations?date=2026-09-16', { headers: jsonHeaders(staffToken) }, ctx.env);
    const codes = (((await day.json()) as { data: Array<{ reservationCode: string }> }).data).map((r) => r.reservationCode).sort();
    expect(codes).toEqual(['RSV-2026-001', 'RSV-2026-002']);
  });

  it('returns 404 for unknown ids', async () => {
    const res = await ctx.app.request('/api/reservations/nope', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/reservations', () => {
  it('creates a reservation with code, split rooms, and calc', async () => {
    const res = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(
        newStay({
          rooms: [
            { roomId: 'room-006', roomNumber: '301', roomTypeName: 'Homy' },
            { roomId: 'room-008', roomNumber: '401', roomTypeName: 'Family' },
          ],
        }),
      ),
    }, ctx.env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      data: {
        reservationCode: string;
        status: string;
        totalAmount: number;
        rooms: Array<{ rate: number; subtotal: number }>;
        calc: { roomTotal: number };
      };
    };
    expect(json.data.reservationCode).toMatch(/^RSV-\d{4}-\d{3}$/);
    expect(json.data.status).toBe('reserved');
    expect(json.data.totalAmount).toBe(1000000);
    expect(json.data.rooms.map((r) => r.subtotal)).toEqual([500000, 500000]);
    expect(json.data.rooms.map((r) => r.rate)).toEqual([250000, 250000]);
  });

  it('rejects overlapping rooms with 409 but allows boundary touches', async () => {
    // room-001 is booked by res-001 over [2026-09-15, 2026-09-17).
    const clash = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(
        newStay({
          checkInDate: '2026-09-16',
          checkOutDate: '2026-09-18',
          rooms: [{ roomId: 'room-001', roomNumber: '101', roomTypeName: 'Standard' }],
          pricing: {
            mode: 'same',
            nightlyRates: [
              { date: '2026-09-16', rate: 750000 },
              { date: '2026-09-17', rate: 750000 },
            ],
            paymentType: 'no_dp',
            dpType: 'percentage',
          },
        }),
      ),
    }, ctx.env);
    expect(clash.status).toBe(409);

    // room-002 is free until res-006 checks in on 2026-09-21: touch is fine.
    const touch = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(
        newStay({
          checkInDate: '2026-09-19',
          checkOutDate: '2026-09-21',
          rooms: [{ roomId: 'room-002', roomNumber: '102', roomTypeName: 'Standard' }],
          pricing: {
            mode: 'same',
            nightlyRates: [
              { date: '2026-09-19', rate: 750000 },
              { date: '2026-09-20', rate: 750000 },
            ],
            paymentType: 'no_dp',
            dpType: 'percentage',
          },
        }),
      ),
    }, ctx.env);
    expect(touch.status).toBe(201);
  });

  it('validates input with 422 + field errors', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['short guest', newStay({ guestName: 'A' })],
      ['reversed dates', newStay({ checkInDate: '2026-11-03', checkOutDate: '2026-11-01' })],
      ['no rooms', newStay({ rooms: [] })],
      ['duplicate rooms', newStay({ rooms: [{ roomId: 'room-008', roomNumber: '401' }, { roomId: 'room-008', roomNumber: '401' }] })],
      ['unknown room', newStay({ rooms: [{ roomId: 'room-999', roomNumber: '999', roomTypeName: 'Ghost' }] })],
      [
        'nightly mismatch',
        newStay({ pricing: { mode: 'same', nightlyRates: [{ date: '2026-11-01', rate: 1 }], paymentType: 'no_dp', dpType: 'percentage' } }),
      ],
      [
        'fixed exceeds total',
        newStay({
          pricing: {
            mode: 'same',
            nightlyRates: [
              { date: '2026-11-01', rate: 100000 },
              { date: '2026-11-02', rate: 100000 },
            ],
            paymentType: 'dp',
            dpType: 'fixed',
            dpFixedAmount: 500000,
          },
        }),
      ],
      [
        'percentage out of range',
        newStay({
          pricing: {
            mode: 'same',
            nightlyRates: [
              { date: '2026-11-01', rate: 100000 },
              { date: '2026-11-02', rate: 100000 },
            ],
            paymentType: 'dp',
            dpType: 'percentage',
            dpPercentage: 150,
          },
        }),
      ],
    ];
    for (const [name, body] of cases) {
      const res = await ctx.app.request('/api/reservations', {
        method: 'POST',
        headers: jsonHeaders(staffToken),
        body: JSON.stringify(body),
      }, ctx.env);
      expect(res.status, name).toBe(422);
      expect(((await res.json()) as { errors: object }).errors, name).toBeDefined();
    }
  });
});

describe('PATCH /api/reservations/:id', () => {
  it('updates guest/notes and re-splits rooms when pricing changes', async () => {
    const res = await ctx.app.request('/api/reservations/res-001', {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({
        guestName: 'John Updated',
        pricing: {
          mode: 'different',
          nightlyRates: [
            { date: '2026-09-15', rate: 800000 },
            { date: '2026-09-16', rate: 900000 },
          ],
          paymentType: 'dp',
          dpType: 'percentage',
          dpPercentage: 10,
        },
      }),
    }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { guestName: string; totalAmount: number; calc: { dpAmount: number; remainingBalance: number } };
    };
    expect(json.data.guestName).toBe('John Updated');
    expect(json.data.totalAmount).toBe(1700000);
    expect(json.data.calc.dpAmount).toBe(170000);
    expect(json.data.calc.remainingBalance).toBe(1530000);
  });

  it('skips the overlap check for metadata-only patches', async () => {
    // res-001 shares room-001 with res-002 in legacy seed data; a notes-only
    // patch must still succeed because occupancy did not change.
    const res = await ctx.app.request('/api/reservations/res-001', {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ notes: 'keeps its own room' }),
    }, ctx.env);
    expect(res.status).toBe(200);
  });

  it('rejects moving into another reservation’s rooms', async () => {
    // res-006 room-002 [2026-09-21, 2026-09-23); move res-007 room-004 onto room-002 same range.
    const res = await ctx.app.request('/api/reservations/res-007', {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ rooms: [{ roomId: 'room-002', roomNumber: '102', roomTypeName: 'Standard' }] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });
});

describe('transitions', () => {
  it('runs reserved → checked-in → checked-out and rejects illegal moves', async () => {
    const inRes = await ctx.app.request('/api/reservations/res-001/check-in', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(inRes.status).toBe(200);
    expect(((await inRes.json()) as { data: { status: string } }).data.status).toBe('checked-in');

    const again = await ctx.app.request('/api/reservations/res-001/check-in', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(again.status).toBe(409);

    const outRes = await ctx.app.request('/api/reservations/res-001/check-out', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(outRes.status).toBe(200);

    const early = await ctx.app.request('/api/reservations/res-006/check-out', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(early.status).toBe(409);
  });

  it('cancels from reserved with total → 0, refuses terminal states', async () => {
    const cancel = await ctx.app.request('/api/reservations/res-006/cancel', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(cancel.status).toBe(200);
    const json = (await cancel.json()) as { data: { status: string; totalAmount: number } };
    expect(json.data.status).toBe('cancelled');
    expect(json.data.totalAmount).toBe(0);

    const repeat = await ctx.app.request('/api/reservations/res-006/cancel', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(repeat.status).toBe(409);

    const out = await ctx.app.request('/api/reservations/res-003/cancel', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(out.status).toBe(409);
  });

  it('enforces action permissions (staff has no reservation.delete)', async () => {
    const res = await ctx.app.request('/api/reservations/res-006/cancel', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown ids', async () => {
    const res = await ctx.app.request('/api/reservations/nope/check-in', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(res.status).toBe(404);
  });
});

describe('availability + calendar', () => {
  it('returns booked room ids for a range, honouring excludeId', async () => {
    const res = await ctx.app.request('/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-17', {
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { data: { bookedRoomIds: string[] } }).data.bookedRoomIds;
    expect(ids).toEqual(expect.arrayContaining(['room-001', 'room-003']));

    const excl = await ctx.app.request(
      '/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-17&excludeId=res-002',
      { headers: jsonHeaders(staffToken) },
      ctx.env,
    );
    const ids2 = ((await excl.json()) as { data: { bookedRoomIds: string[] } }).data.bookedRoomIds;
    expect(ids2).toEqual(['room-001']);
  });

  it('rejects reversed ranges with 400', async () => {
    const res = await ctx.app.request('/api/reservations/availability?checkIn=2026-09-18&checkOut=2026-09-16', {
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(res.status).toBe(400);
  });

  it('lists calendar entries overlapping a range with filters', async () => {
    const res = await ctx.app.request('/api/reservations/calendar?from=2026-09-15&to=2026-09-20', {
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect(res.status).toBe(200);
    const codes = (((await res.json()) as { data: Array<{ reservationCode: string }> }).data)
      .map((e) => e.reservationCode)
      .sort();
    // res-001 [15,17), res-002 [16,19), res-005 [18,20, cancelled but still listed)
    expect(codes).toEqual(['RSV-2026-001', 'RSV-2026-002', 'RSV-2026-005']);

    const room = await ctx.app.request('/api/reservations/calendar?from=2026-09-15&to=2026-09-20&roomId=room-003', {
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect((((await room.json()) as { data: Array<{ reservationCode: string }> }).data).map((e) => e.reservationCode)).toEqual([
      'RSV-2026-002',
    ]);

    const status = await ctx.app.request('/api/reservations/calendar?from=2026-09-15&to=2026-09-20&status=cancelled', {
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    expect((((await status.json()) as { data: Array<{ reservationCode: string }> }).data).map((e) => e.reservationCode)).toEqual([
      'RSV-2026-005',
    ]);
  });
});

describe('reservation RBAC matrix', () => {
  it('a view-only user gets 403 on create/update/transition', async () => {
    const created = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Viewer', email: 'viewer@hotel.com', password: 'viewer123', roles: ['role-004'] }),
    }, ctx.env);
    expect(created.status).toBe(201);
    const viewerToken = await loginAs(ctx.app, ctx.env, 'viewer@hotel.com', 'viewer123');

    const post = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(viewerToken),
      body: JSON.stringify(newStay()),
    }, ctx.env);
    expect(post.status).toBe(403);

    const patch = await ctx.app.request('/api/reservations/res-001', {
      method: 'PATCH',
      headers: jsonHeaders(viewerToken),
      body: JSON.stringify({ notes: 'nope' }),
    }, ctx.env);
    expect(patch.status).toBe(403);

    const checkin = await ctx.app.request('/api/reservations/res-001/check-in', {
      method: 'POST',
      headers: jsonHeaders(viewerToken),
    }, ctx.env);
    expect(checkin.status).toBe(403);

    const read = await ctx.app.request('/api/reservations/res-001', {
      headers: jsonHeaders(viewerToken),
    }, ctx.env);
    expect(read.status).toBe(200);
  });
});
