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

interface ActivityShape {
  id: string;
  category: string;
  action: string;
  description: string;
  userId: string;
  userName: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string>;
  ipAddress?: string;
  createdAt: string;
}

async function listActivities(query: string, token: string) {
  const res = await ctx.app.request(`/api/activities${query}`, { headers: jsonHeaders(token) }, ctx.env);
  expect(res.status).toBe(200);
  return (await res.json()) as { data: ActivityShape[]; pagination: { page: number; pageSize: number; total: number } };
}

function newStay(overrides: Record<string, unknown> = {}) {
  return {
    guestName: 'Audit Guest',
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

describe('GET /api/activities', () => {
  it('requires authentication (401)', async () => {
    const res = await ctx.app.request('/api/activities', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('requires the activity.view permission (staff has none → 403)', async () => {
    const res = await ctx.app.request('/api/activities', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(403);
  });

  it('lists seeded activities with the frontend shape (newest first)', async () => {
    const json = await listActivities('?page=1&pageSize=100', adminToken);
    // 10 seeded rows + the 2 hook rows from beforeEach logins.
    expect(json.pagination.total).toBe(12);
    for (const id of ['act-001', 'act-005', 'act-010']) {
      expect(json.data.map((a) => a.id)).toContain(id);
    }
    const first = json.data[0];
    for (const key of ['id', 'category', 'action', 'description', 'userId', 'userName', 'createdAt']) {
      expect(first, key).toHaveProperty(key);
    }
    expect(first).not.toHaveProperty('updatedAt');
    expect(first).not.toHaveProperty('passwordHash');
    // Newest-first: the hook rows (now) sort before the 2026-09 seed rows.
    expect(json.data[0].createdAt >= json.data[json.data.length - 1].createdAt).toBe(true);
  });

  it('preserves string-valued metadata verbatim', async () => {
    const json = await listActivities('?page=1&pageSize=100', adminToken);
    const act002 = json.data.find((a) => a.id === 'act-002');
    expect(act002?.metadata).toEqual({ reservationCode: 'RSV-2026-006', guestName: 'John Doe', totalAmount: '1500000' });
    for (const a of json.data) {
      if (a.metadata) {
        for (const v of Object.values(a.metadata)) expect(typeof v).toBe('string');
      }
    }
  });

  it('supports search across description and userName', async () => {
    // Frontend matches description + userName only (not metadata).
    const byGuest = await listActivities('?search=Jane%20Smith&page=1&pageSize=100', adminToken);
    expect(byGuest.data.map((a) => a.id)).toEqual(['act-003']);

    const byUser = await listActivities('?search=Staff%20User&page=1&pageSize=100', adminToken);
    expect(byUser.data.map((a) => a.id)).toContain('act-009');

    const byDesc = await listActivities('?search=Utilities&page=1&pageSize=100', adminToken);
    expect(byDesc.data.map((a) => a.id)).toEqual(['act-007']);
  });

  it('supports category filtering (finance has no hooks, stays at 4)', async () => {
    const finance = await listActivities('?category=finance&page=1&pageSize=100', adminToken);
    expect(finance.pagination.total).toBe(4);
    expect(finance.data.map((a) => a.id).sort()).toEqual(['act-004', 'act-005', 'act-007', 'act-010']);

    const system = await listActivities('?category=system&page=1&pageSize=100', adminToken);
    expect(system.data.map((a) => a.id)).toContain('act-009');
  });

  it('supports userId filtering', async () => {
    const json = await listActivities('?userId=user-001&page=1&pageSize=100', adminToken);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.every((a) => a.userId === 'user-001')).toBe(true);
    expect(json.data.map((a) => a.id)).toContain('act-001');
  });

  it('supports pagination with totals', async () => {
    const p1 = await listActivities('?category=finance&page=1&pageSize=3', adminToken);
    expect(p1.pagination).toMatchObject({ page: 1, pageSize: 3, total: 4 });
    expect(p1.data).toHaveLength(3);
    const p2 = await listActivities('?category=finance&page=2&pageSize=3', adminToken);
    expect(p2.data).toHaveLength(1);
    // Newest-first across pages: every p1 row is newer than every p2 row.
    expect(p1.data[2].createdAt >= p2.data[0].createdAt).toBe(true);
  });

  it('returns 404 for unknown ids', async () => {
    const res = await ctx.app.request('/api/activities/nope', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(res.status).toBe(404);
  });
});

describe('audit log immutability', () => {
  it('exposes no write endpoints (POST/PATCH/PUT/DELETE → 404)', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await ctx.app.request('/api/activities/act-001', {
        method,
        headers: jsonHeaders(adminToken),
        body: JSON.stringify({}),
      }, ctx.env);
      expect(res.status, method).toBe(404);
    }
    const post = await ctx.app.request('/api/activities', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ category: 'system', action: 'create', description: 'forged', userId: 'x', userName: 'y' }),
    }, ctx.env);
    expect(post.status).toBe(404);
  });

  it('user renames do not rewrite history (userName is a snapshot)', async () => {
    const before = await listActivities('?search=Admin%20logged%20in&page=1&pageSize=100', adminToken);
    expect(before.data.length).toBeGreaterThan(0);

    await ctx.app.request('/api/users/user-001', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Renamed Admin' }),
    }, ctx.env);

    const after = await listActivities('?search=Admin%20logged%20in&page=1&pageSize=100', adminToken);
    expect(after.data.map((a) => a.userName)).toContain('Admin User');
  });
});

describe('audit hooks: authentication', () => {
  it('logs login with the authenticated actor', async () => {
    await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const json = await listActivities('?search=logged%20in&page=1&pageSize=100', adminToken);
    const mine = json.data.find((a) => a.userId === 'user-001' && a.action === 'login' && a.category === 'authentication');
    expect(mine).toBeDefined();
    expect(mine?.userName).toBe('Admin User');
    expect(mine?.metadata?.email).toBe('admin@hotel.com');
  });

  it('logs register, logout, and password change', async () => {
    const reg = await ctx.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Audit New', email: 'audit-new@hotel.com', password: 'audit123' }),
    }, ctx.env);
    expect(reg.status).toBe(201);
    const regJson = (await reg.json()) as { data: { token: string; user: { id: string } } };

    const registered = await listActivities('?search=registered%20a%20new%20account&page=1&pageSize=100', adminToken);
    expect(registered.data.map((a) => a.userId)).toContain(regJson.data.user.id);

    const out = await ctx.app.request('/api/auth/logout', {
      method: 'POST',
      headers: jsonHeaders(regJson.data.token),
    }, ctx.env);
    expect(out.status).toBe(200);
    const loggedOut = await listActivities('?search=logged%20out&page=1&pageSize=100', adminToken);
    expect(loggedOut.data.map((a) => a.userId)).toContain(regJson.data.user.id);

    const changed = await ctx.app.request('/api/auth/change-password', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ currentPassword: ADMIN.password, newPassword: 'admin123' }),
    }, ctx.env);
    expect(changed.status).toBe(200);
    // Password change invalidates the old token; re-login for later hooks.
    adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, 'admin123');
    await ctx.app.request('/api/auth/change-password', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ currentPassword: 'admin123', newPassword: ADMIN.password }),
    }, ctx.env);
    adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const pw = await listActivities('?search=changed%20password&page=1&pageSize=100', adminToken);
    expect(pw.data.length).toBeGreaterThan(0);
    expect(pw.data[0].category).toBe('authentication');
  });

  it('does not log failed logins or forgot-password (no trustworthy actor)', async () => {
    const before = (await listActivities('?page=1&pageSize=100', adminToken)).pagination.total;
    const bad = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, password: 'wrong-password' }),
    }, ctx.env);
    expect(bad.status).toBe(401);
    await ctx.app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email }),
    }, ctx.env);
    const after = (await listActivities('?page=1&pageSize=100', adminToken)).pagination.total;
    expect(after).toBe(before);
  });
});

describe('audit hooks: reservations', () => {
  it('logs create, update, check-in, check-out, and cancel', async () => {
    const created = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay({ guestName: 'Hook Guest' })),
    }, ctx.env);
    expect(created.status).toBe(201);
    const { id, reservationCode } = ((await created.json()) as { data: { id: string; reservationCode: string } }).data;

    const list1 = await listActivities(`?search=${reservationCode}&page=1&pageSize=100`, adminToken);
    const createRow = list1.data.find((a) => a.action === 'create');
    expect(createRow).toBeDefined();
    expect(createRow?.category).toBe('reservation');
    expect(createRow?.userId).toBe('user-003');
    expect(createRow?.userName).toBe('Staff User');
    expect(createRow?.entityId).toBe(id);
    expect(createRow?.entityType).toBe('reservation');

    await ctx.app.request(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ notes: 'hook note' }),
    }, ctx.env);
    await ctx.app.request(`/api/reservations/${id}/check-in`, {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);
    await ctx.app.request(`/api/reservations/${id}/check-out`, {
      method: 'POST',
      headers: jsonHeaders(staffToken),
    }, ctx.env);

    const list2 = await listActivities(`?search=${reservationCode}&page=1&pageSize=100`, adminToken);
    for (const action of ['update', 'checkin', 'checkout']) {
      expect(list2.data.map((a) => a.action), action).toContain(action);
    }

    const created2 = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay({ guestName: 'Cancel Hook', checkInDate: '2026-12-01', checkOutDate: '2026-12-03', pricing: { mode: 'same', nightlyRates: [{ date: '2026-12-01', rate: 100000 }, { date: '2026-12-02', rate: 100000 }], paymentType: 'no_dp', dpType: 'percentage' } })),
    }, ctx.env);
    const cancelId = ((await created2.json()) as { data: { id: string } }).data.id;
    await ctx.app.request(`/api/reservations/${cancelId}/cancel`, {
      method: 'POST',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    const list3 = await listActivities('?search=Cancel%20Hook&page=1&pageSize=100', adminToken);
    expect(list3.data.map((a) => a.action)).toContain('cancel');
  });

  it('does not log failed reservation writes', async () => {
    const before = (await listActivities('?page=1&pageSize=100', adminToken)).pagination.total;
    const bad = await ctx.app.request('/api/reservations', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify(newStay({ rooms: [{ roomId: 'room-999', roomNumber: '999' }] })),
    }, ctx.env);
    expect(bad.status).toBe(422);
    const after = (await listActivities('?page=1&pageSize=100', adminToken)).pagination.total;
    expect(after).toBe(before);
  });

  it('preserves reservation snapshots when room data changes (Phase 3 intact)', async () => {
    const before = await ctx.app.request('/api/reservations/res-001', { headers: jsonHeaders(staffToken) }, ctx.env);
    const beforeRooms = ((await before.json()) as { data: { rooms: unknown[] } }).data.rooms;
    await ctx.app.request('/api/rooms/room-002', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'maintenance' }),
    }, ctx.env);
    const after = await ctx.app.request('/api/reservations/res-001', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await after.json()) as { data: { rooms: unknown[] } }).data.rooms).toEqual(beforeRooms);
  });
});

describe('audit hooks: rooms and room types', () => {
  it('logs room create/update and room-type create under system', async () => {
    const created = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roomNumber: '601', roomTypeId: 'room-type-001' }),
    }, ctx.env);
    expect(created.status).toBe(201);
    const roomId = ((await created.json()) as { data: { id: string } }).data.id;

    await ctx.app.request(`/api/rooms/${roomId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'maintenance' }),
    }, ctx.env);

    const typeCreated = await ctx.app.request('/api/room-types', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({
        name: 'Audit Type',
        description: 'created by audit test',
        capacity: 2,
        facilities: [],
        defaultRate: 100000,
        images: [],
      }),
    }, ctx.env);
    expect(typeCreated.status).toBe(201);
    const typeId = ((await typeCreated.json()) as { data: { id: string } }).data.id;
    await ctx.app.request(`/api/room-types/${typeId}`, { method: 'DELETE', headers: jsonHeaders(adminToken) }, ctx.env);

    const rows = await listActivities('?category=system&page=1&pageSize=100', adminToken);
    const roomRows = rows.data.filter((a) => a.entityId === roomId);
    expect(roomRows.map((a) => a.action).sort()).toEqual(['create', 'update']);
    expect(roomRows[0].entityType).toBe('room');
    const typeRows = rows.data.filter((a) => a.entityId === typeId);
    expect(typeRows.map((a) => a.action).sort()).toEqual(['create', 'delete']);
  });

  it('does not log failed room writes', async () => {
    const before = (await listActivities('?category=system&page=1&pageSize=100', adminToken)).pagination.total;
    const dup = await ctx.app.request('/api/rooms', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roomNumber: '101', roomTypeId: 'room-type-001' }),
    }, ctx.env);
    expect(dup.status).toBe(409);
    const after = (await listActivities('?category=system&page=1&pageSize=100', adminToken)).pagination.total;
    expect(after).toBe(before);
  });
});
