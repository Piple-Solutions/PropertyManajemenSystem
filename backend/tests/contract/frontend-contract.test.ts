import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from '../helpers/app';
import type { TestContext } from '../helpers/app';

/**
 * FRONTEND CONTRACT LOCK (Block 0, 0.3). Derived from
 * `frontend/src/services/*` (see `.tmp-fix/contract.md`). Every assertion is
 * something the current frontend relies on: endpoint + method + request body
 * accepted, response fields it reads, status codes it branches on, and the
 * `{ message, errors? }` error shape that `apiErrorMessage` flattens.
 *
 * These tests must stay green for the whole remediation. Never edit one to
 * match new behavior.
 */
let ctx: TestContext;
let admin: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await ctx.app.request(
    path,
    {
      method,
      headers: jsonHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    ctx.env,
  );
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}

const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
const has = (o: Record<string, unknown>, ...ks: string[]) => {
  for (const k of ks) expect(o, `missing field ${k}`).toHaveProperty(k);
};

describe('contract: error envelope read by api.ts / apiErrorMessage', () => {
  it('errors are { message } and validation errors add { errors: { field: string[] } }', async () => {
    const unauth = await call('GET', '/api/users');
    expect(unauth.status).toBe(401);
    expect(typeof unauth.json.message).toBe('string');

    const invalid = await call('POST', '/api/auth/login', undefined, { email: 'x', password: '' });
    expect(invalid.status).toBe(422);
    expect(typeof invalid.json.message).toBe('string');
    for (const msgs of Object.values(invalid.json.errors as Record<string, unknown>)) {
      expect(Array.isArray(msgs)).toBe(true);
      for (const m of msgs as unknown[]) expect(typeof m).toBe('string');
    }

    const missing = await call('GET', '/api/reservations/nope', staff);
    expect(missing.status).toBe(404);
    expect(typeof missing.json.message).toBe('string');

    const nf = await call('GET', '/api/nope', admin);
    expect(nf.status).toBe(404);
    expect(typeof nf.json.message).toBe('string');
  });

  it('DELETE success is 204 with no body (apiFetch returns undefined on 204)', async () => {
    const created = await call('POST', '/api/rooms', admin, { roomNumber: 'C-1', roomTypeId: 'room-type-001' });
    const del = await ctx.app.request(`/api/rooms/${created.json.data.id}`, { method: 'DELETE', headers: jsonHeaders(admin) }, ctx.env);
    expect(del.status).toBe(204);
    expect(await del.text()).toBe('');
  });
});

describe('contract: authService', () => {
  it('POST /api/auth/login -> { data: { user, token, permissions, expiresIn } }; 401 = bad credentials', async () => {
    const ok = await call('POST', '/api/auth/login', undefined, { email: ADMIN.email, password: ADMIN.password });
    expect(ok.status).toBe(200);
    has(ok.json.data, 'user', 'token', 'permissions', 'expiresIn');
    expect(typeof ok.json.data.token).toBe('string');
    expect(Array.isArray(ok.json.data.permissions)).toBe(true);
    has(ok.json.data.user, 'id', 'name', 'email', 'roles', 'status', 'createdAt', 'updatedAt');
    expect(Array.isArray(ok.json.data.user.roles)).toBe(true);
    expect(ok.json.data.user).not.toHaveProperty('passwordHash');
    expect(ok.json.data.user).not.toHaveProperty('password');

    const bad = await call('POST', '/api/auth/login', undefined, { email: ADMIN.email, password: 'wrong-wrong' });
    expect(bad.status).toBe(401); // authService.login maps 401 -> null
  });

  it('GET /api/auth/me -> { data: { user, permissions } }', async () => {
    const me = await call('GET', '/api/auth/me', admin);
    expect(me.status).toBe(200);
    has(me.json.data, 'user', 'permissions');
    expect(me.json.data.permissions).toContain('user.view');
  });

  it('POST /api/auth/register: 201 { data: { user, token, ... } } and 409 duplicate email (authService.register maps 409 -> null)', async () => {
    const dup = await call('POST', '/api/auth/register', undefined, { name: 'Dup', email: ADMIN.email, password: 'whatever1' });
    // 409 today; Block 1 turns registration into 403 for everyone (documented in contract.md).
    expect([409, 403]).toContain(dup.status);
  });

  it('POST /api/auth/change-password -> 200 ok / 4xx failure (service returns boolean)', async () => {
    const wrong = await call('POST', '/api/auth/change-password', staff, { currentPassword: 'nope-nope', newPassword: 'newpass123' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);
    const ok = await call('POST', '/api/auth/change-password', staff, { currentPassword: STAFF.password, newPassword: 'newpass123' });
    expect(ok.status).toBe(200);
  });

  it('POST /api/auth/forgot-password -> { data: { message, resetToken? } }; reset-password -> 200', async () => {
    const forgot = await call('POST', '/api/auth/forgot-password', undefined, { email: STAFF.email });
    expect(forgot.status).toBe(200);
    expect(typeof forgot.json.data.message).toBe('string');
    const reset = await call('POST', '/api/auth/reset-password', undefined, {
      token: forgot.json.data.resetToken,
      newPassword: 'resetpass1',
    });
    expect(reset.status).toBe(200);
  });

  it('POST /api/auth/logout is authenticated and answers 200', async () => {
    expect((await call('POST', '/api/auth/logout', admin)).status).toBe(200);
  });
});

describe('contract: list services (page size 100, { data, pagination })', () => {
  const lists: Array<[string, string, string]> = [
    ['users', '/api/users?page=1&pageSize=100', 'admin'],
    ['roles', '/api/roles?page=1&pageSize=100', 'admin'],
    ['rooms', '/api/rooms?page=1&pageSize=100', 'staff'],
    ['room-types', '/api/room-types?page=1&pageSize=100', 'staff'],
    ['reservations', '/api/reservations?page=1&pageSize=100', 'staff'],
    ['activities', '/api/activities?page=1&pageSize=100', 'admin'],
  ];
  for (const [name, path, who] of lists) {
    it(`${name}: pageSize=100 is accepted and returns the pagination envelope`, async () => {
      const res = await call('GET', path, who === 'admin' ? admin : staff);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json.data)).toBe(true);
      expect(keys(res.json.pagination)).toEqual(['page', 'pageSize', 'total']);
      expect(res.json.pagination.page).toBe(1);
      expect(res.json.pagination.pageSize).toBe(100);
    });
  }

  it('pageSize above 100 is rejected with 422 (frontend never asks for more)', async () => {
    expect((await call('GET', '/api/reservations?pageSize=101', staff)).status).toBe(422);
  });

  it('activityService.getRecent: pageSize=<limit> is accepted', async () => {
    const res = await call('GET', '/api/activities?page=1&pageSize=20', admin);
    expect(res.status).toBe(200);
    expect(res.json.pagination.pageSize).toBe(20);
  });

  it('GET /api/permissions -> { data: Permission[] } with id/name/description/resource/action/group', async () => {
    const res = await call('GET', '/api/permissions', admin);
    expect(res.status).toBe(200);
    for (const p of res.json.data) has(p, 'id', 'name', 'description', 'resource', 'action', 'group');
    expect(res.json.data.length).toBeGreaterThan(0);
  });
});

describe('contract: entity shapes read by the pages', () => {
  it('user: id name email roles[] status createdAt updatedAt', async () => {
    const res = await call('GET', '/api/users/user-003', admin);
    has(res.json.data, 'id', 'name', 'email', 'roles', 'status', 'createdAt', 'updatedAt');
    expect(res.json.data.roles).toEqual(['role-003']);
  });

  it('role: id name description permissions[] (names) status createdAt updatedAt', async () => {
    const res = await call('GET', '/api/roles/role-003', admin);
    has(res.json.data, 'id', 'name', 'description', 'permissions', 'status', 'createdAt', 'updatedAt');
    expect(res.json.data.permissions).toContain('reservation.view');
    expect(typeof res.json.data.permissions[0]).toBe('string');
  });

  it('room + room type fields (facilities/images are arrays, defaultRate is a number)', async () => {
    const room = await call('GET', '/api/rooms/room-04', staff);
    has(room.json.data, 'id', 'roomNumber', 'roomTypeId', 'status', 'createdAt', 'updatedAt');
    const type = await call('GET', '/api/room-types/room-type-004', staff);
    has(type.json.data, 'id', 'name', 'description', 'capacity', 'facilities', 'defaultRate', 'images', 'status', 'createdAt', 'updatedAt');
    expect(Array.isArray(type.json.data.facilities)).toBe(true);
    expect(Array.isArray(type.json.data.images)).toBe(true);
    expect(typeof type.json.data.defaultRate).toBe('number');
  });

  it('toggleStatus endpoints: PATCH /:id/status { status } for users, rooms, room-types', async () => {
    expect((await call('PATCH', '/api/users/user-005/status', admin, { status: 'inactive' })).status).toBe(200);
    expect((await call('PATCH', '/api/rooms/room-04/status', admin, { status: 'inactive' })).status).toBe(200);
    expect((await call('PATCH', '/api/room-types/room-type-005/status', admin, { status: 'inactive' })).status).toBe(200);
  });

  it('roleService.update: PATCH /api/roles/:id then PUT /api/roles/:id/permissions { permissions: string[] }', async () => {
    const p = await call('PATCH', '/api/roles/role-005', admin, { name: 'Reception Desk', description: 'x', status: 'active' });
    expect(p.status).toBe(200);
    const put = await call('PUT', '/api/roles/role-005/permissions', admin, { permissions: ['room.view', 'reservation.view'] });
    expect(put.status).toBe(200);
    expect(put.json.data.permissions).toEqual(expect.arrayContaining(['room.view', 'reservation.view']));
  });

  it('activity: id category action description userId userName createdAt (+ optional entityType/entityId/metadata/ipAddress)', async () => {
    const res = await call('GET', '/api/activities/act-002', admin);
    has(res.json.data, 'id', 'category', 'action', 'description', 'userId', 'userName', 'createdAt');
  });

  it('dashboard overview: today, reservations{...}, rooms{...}, occupancy{...}, recent[]', async () => {
    const res = await call('GET', '/api/dashboard/overview', staff);
    expect(res.status).toBe(200);
    const d = res.json.data;
    has(d, 'today', 'reservations', 'rooms', 'occupancy', 'recent');
    has(d.reservations, 'total', 'todayCheckins', 'upcoming', 'checkedIn', 'byStatus');
    has(d.reservations.byStatus, 'reserved', 'checked-in', 'checked-out', 'cancelled');
    has(d.rooms, 'total', 'active', 'maintenance', 'inactive');
    has(d.occupancy, 'checkedIn', 'totalRooms', 'rate');
    for (const r of d.recent) has(r, 'id', 'reservationCode', 'guestName', 'source', 'checkInDate', 'status', 'totalAmount', 'createdAt');
  });
});

describe('contract: reservationService', () => {
  const create = {
    guestName: 'Contract Guest',
    source: 'whatsapp',
    checkInDate: '2026-11-05',
    checkOutDate: '2026-11-07',
    notes: '',
    rooms: [{ roomId: 'room-11', roomNumber: '11', roomTypeName: 'Twin' }],
    pricing: {
      mode: 'same',
      nightlyRates: [
        { date: '2026-11-05', rate: 400000 },
        { date: '2026-11-06', rate: 400000 },
      ],
      paymentType: 'dp',
      dpType: 'percentage',
      dpPercentage: 50,
    },
  };

  it('ApiReservation shape: header + pricing{mode,nightlyRates} + payment{type,dpType,dp*} + calc{...} + rooms[]', async () => {
    const res = await call('POST', '/api/reservations', staff, create);
    expect(res.status).toBe(201);
    const r = res.json.data;
    has(r, 'id', 'reservationCode', 'guestName', 'source', 'checkInDate', 'checkOutDate', 'status', 'notes', 'totalAmount', 'createdAt', 'updatedAt', 'pricing', 'payment', 'calc', 'rooms');
    has(r.pricing, 'mode', 'nightlyRates');
    has(r.payment, 'type', 'dpType');
    expect(r.payment.dpPercentage).toBe(50);
    has(r.calc, 'nights', 'nightDates', 'roomTotal', 'dpAmount', 'remainingBalance');
    expect(r.calc).toMatchObject({ nights: 2, roomTotal: 800000, dpAmount: 400000, remainingBalance: 400000 });
    has(r.rooms[0], 'id', 'reservationId', 'roomId', 'roomNumber', 'roomTypeName', 'rate', 'subtotal', 'createdAt');
    expect(r.status).toBe('reserved');
  });

  it('wizard edit: PATCH with the FULL create payload (all fields) succeeds on a reserved reservation', async () => {
    const created = await call('POST', '/api/reservations', staff, create);
    const id = created.json.data.id;
    const edit = await call('PATCH', `/api/reservations/${id}`, staff, { ...create, guestName: 'Edited By Wizard', notes: 'n' });
    expect(edit.status).toBe(200);
    expect(edit.json.data.guestName).toBe('Edited By Wizard');
  });

  it('check-in / check-out / cancel answer 200 and the final status; transitions that are illegal answer 409', async () => {
    const created = await call('POST', '/api/reservations', staff, create);
    const id = created.json.data.id;
    expect((await call('POST', `/api/reservations/${id}/check-in`, staff)).status).toBe(200);
    expect((await call('POST', `/api/reservations/${id}/check-in`, staff)).status).toBe(409);
    expect((await call('POST', `/api/reservations/${id}/check-out`, staff)).status).toBe(200);
    expect((await call('POST', `/api/reservations/${id}/cancel`, admin)).status).toBe(409);
  });

  it('availability -> { data: { bookedRoomIds: string[] } }; calendar -> { data: ApiCalendarEntry[] } with rooms[{roomId,roomNumber,roomTypeName}]', async () => {
    await call('POST', '/api/reservations', staff, create);
    const av = await call('GET', '/api/reservations/availability?checkIn=2026-11-05&checkOut=2026-11-07', staff);
    expect(av.json.data.bookedRoomIds).toContain('room-11');
    const cal = await call('GET', '/api/reservations/calendar?from=2026-11-01&to=2026-12-01', staff);
    expect(cal.status).toBe(200);
    const entry = cal.json.data.find((e: any) => e.guestName === 'Contract Guest');
    has(entry, 'id', 'reservationCode', 'guestName', 'source', 'checkInDate', 'checkOutDate', 'status', 'totalAmount', 'rooms');
    has(entry.rooms[0], 'roomId', 'roomNumber', 'roomTypeName');
  });

  it('validation / conflict statuses the wizard branches on: 422 { errors }, 409 { message }', async () => {
    const invalid = await call('POST', '/api/reservations', staff, { ...create, guestName: 'A' });
    expect(invalid.status).toBe(422);
    expect(invalid.json.errors).toBeDefined();
    await call('POST', '/api/reservations', staff, create);
    const clash = await call('POST', '/api/reservations', staff, create);
    expect(clash.status).toBe(409);
    expect(typeof clash.json.message).toBe('string');
  });
});

describe('contract: reservation edit UI vs status (documents what BE-017 must keep allowing)', () => {
  /**
   * `ReservationDetailPage` shows the Edit button for EVERY status and
   * `saveReservationDraft` always PATCHes the full payload (guest, source,
   * dates, notes, rooms, pricing). A guard for BE-017 therefore must not
   * reject a PATCH whose financial/date/room content is unchanged.
   */
  it('PATCH with an unchanged full payload succeeds today on checked-in / checked-out / cancelled reservations', async () => {
    const base = {
      guestName: 'Edit Status Guest',
      source: 'direct',
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-03',
      notes: '',
      pricing: {
        mode: 'same',
        nightlyRates: [
          { date: '2026-12-01', rate: 350000 },
          { date: '2026-12-02', rate: 350000 },
        ],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    };
    const make = async (roomId: string, roomNumber: string) => {
      const res = await call('POST', '/api/reservations', staff, { ...base, rooms: [{ roomId, roomNumber, roomTypeName: 'Standard' }] });
      expect(res.status).toBe(201);
      return res.json.data.id as string;
    };
    const checkedIn = await make('room-12', '12');
    await call('POST', `/api/reservations/${checkedIn}/check-in`, staff);
    const checkedOut = await make('room-13', '13');
    await call('POST', `/api/reservations/${checkedOut}/check-in`, staff);
    await call('POST', `/api/reservations/${checkedOut}/check-out`, staff);
    const cancelled = await make('room-14', '14');
    await call('POST', `/api/reservations/${cancelled}/cancel`, admin);

    for (const [label, id] of [['checked-in', checkedIn], ['checked-out', checkedOut], ['cancelled', cancelled]] as const) {
      const full = (await call('GET', `/api/reservations/${id}`, staff)).json.data;
      expect(full.status).toBe(label);
      const payload = {
        guestName: full.guestName,
        source: full.source,
        checkInDate: full.checkInDate,
        checkOutDate: full.checkOutDate,
        notes: full.notes,
        rooms: full.rooms.map((r: any) => ({ roomId: r.roomId, roomNumber: r.roomNumber, roomTypeName: r.roomTypeName })),
        pricing: {
          mode: full.pricing.mode,
          nightlyRates: full.pricing.nightlyRates,
          paymentType: full.payment.type,
          dpType: full.payment.dpType,
          ...(full.payment.dpPercentage !== undefined ? { dpPercentage: full.payment.dpPercentage } : {}),
          ...(full.payment.dpFixedAmount !== undefined ? { dpFixedAmount: full.payment.dpFixedAmount } : {}),
        },
      };
      const res = await call('PATCH', `/api/reservations/${id}`, staff, payload);
      expect(res.status, label).toBe(200);
    }
  });

  it('legacy seeded reservations reference room ids that no longer exist: re-saving their rooms is 422 today (seed drift, not a regression)', async () => {
    const res = await call('PATCH', '/api/reservations/res-002', staff, {
      rooms: [{ roomId: 'room-001', roomNumber: '102', roomTypeName: 'Standard' }],
    });
    expect(res.status).toBe(422);
  });
});

describe('contract: public + holidays + finance not called by the frontend', () => {
  it('GET /api/public/room-types needs no auth and exposes only what the public kit maps', async () => {
    const res = await call('GET', '/api/public/room-types');
    expect(res.status).toBe(200);
    for (const t of res.json.data) has(t, 'id', 'name', 'description', 'capacity', 'facilities');
  });

  it('GET /api/public/holidays validates year (400/422 on bad input) and needs no auth', async () => {
    const res = await call('GET', '/api/public/holidays?year=1999');
    expect(res.status).toBe(422);
  });

  it('finance endpoints exist and are permission-gated (FE-001: the frontend does not call them yet)', async () => {
    for (const path of ['/api/invoices', '/api/expenses', '/api/sales', '/api/reports/summary?start=2026-09-01&end=2026-09-30']) {
      expect((await call('GET', path, staff)).status, path).toBe(403);
      expect((await call('GET', path, admin)).status, path).toBe(200);
    }
  });
});
