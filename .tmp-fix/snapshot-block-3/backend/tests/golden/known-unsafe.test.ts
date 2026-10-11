import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAs, setupTestApp, ADMIN } from '../helpers/app';
import type { TestContext } from '../helpers/app';
import { freezeClock, unfreezeClock } from '../helpers/golden';

/**
 * KNOWN-UNSAFE CHARACTERIZATION (Block 0, 0.4).
 *
 * Each test pins a behavior that the audit classifies as a DEFECT and that a
 * later block deliberately changes. They exist so that (a) the audit's claims
 * are verified against the code at baseline, and (b) the block that fixes the
 * finding converts the matching test into its regression test. They are NOT
 * happy-path goldens: the happy-path goldens live in the other files of this
 * directory and must never change.
 *
 * Flip map (finding -> block that is allowed to invert the assertion):
 *   BE-001 -> 1 | BE-002/BE-003/BE-007 -> 2 | BE-023 -> 3
 *   BE-017/BE-024/BE-025 -> 4 | BE-015 -> 5 | BE-019/BE-020/BE-022 -> 6
 */
let ctx: TestContext;
let admin: string;
let manager: string;
let staff: string;

beforeEach(async () => {
  freezeClock();
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
  staff = await loginAs(ctx.app, ctx.env, 'staff@hotel.com', 'staff123');
});
afterEach(() => unfreezeClock());

async function call(method: string, path: string, token: string | undefined, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await ctx.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, ctx.env);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const stay = (over: Record<string, unknown> = {}) => ({
  guestName: 'Unsafe Guest',
  source: 'direct',
  checkInDate: '2026-12-10',
  checkOutDate: '2026-12-12',
  notes: '',
  rooms: [{ roomId: 'room-10', roomNumber: '10', roomTypeName: 'Twin' }],
  pricing: {
    mode: 'same',
    nightlyRates: [
      { date: '2026-12-10', rate: 300000 },
      { date: '2026-12-11', rate: 300000 },
    ],
    paymentType: 'no_dp',
    dpType: 'percentage',
  },
  ...over,
});

const activityTotal = async () =>
  ((await call('GET', '/api/activities?page=1&pageSize=1', admin)).json as { pagination: { total: number } }).pagination.total;

describe('FIXED in Block 1: BE-001 public registration', () => {
  it('anonymous POST /api/auth/register is now 403 (was 201 + usable JWT)', async () => {
    const reg = await call('POST', '/api/auth/register', undefined, { name: 'Anon User', email: 'anon@x.com', password: 'anon1234' });
    expect(reg.status).toBe(403);
    expect(reg.json.message).toMatch(/dinonaktifkan/);
  });
});

describe('FIXED in Block 2: BE-002 / BE-003 / BE-007 authorization', () => {
  it('BE-002: a Manager can no longer strip the Super Admin role from user-001 (was 200)', async () => {
    const res = await call('PUT', '/api/users/user-001/roles', manager, { roles: ['role-003'] });
    expect(res.status).toBe(403);
    expect((await call('GET', '/api/users/user-001', admin)).json.data.roles).toEqual(['role-001']);
  });

  it('BE-002: a Manager can no longer deactivate the Super Admin (was 200 + admin locked out)', async () => {
    const res = await call('PATCH', '/api/users/user-001/status', manager, { status: 'inactive' });
    expect(res.status).toBe(403);
    const me = await call('GET', '/api/auth/me', admin);
    expect(me.status).toBe(200);
  });

  it('BE-003: role.create alone no longer attaches permissions to a new role (was 201)', async () => {
    const custom = await call('POST', '/api/roles', admin, {
      name: 'Role Maker',
      permissions: ['user.view', 'user.update', 'role.view', 'role.create'],
    });
    expect(custom.status).toBe(201);
    const mk = await call('POST', '/api/users', admin, {
      name: 'Role Maker', email: 'maker@hotel.com', password: 'maker123', roles: [custom.json.data.id],
    });
    expect(mk.status).toBe(201);
    const makerToken = await loginAs(ctx.app, ctx.env, 'maker@hotel.com', 'maker123');
    const escalated = await call('POST', '/api/roles', makerToken, {
      name: 'Escalated', permissions: ['user.delete', 'role.delete', 'user.create'],
    });
    expect(escalated.status).toBe(403);
  });

  it('BE-007: the inactive role-004 (Viewer) no longer grants its permissions', async () => {
    const mk = await call('POST', '/api/users', admin, {
      name: 'Viewer', email: 'viewer@hotel.com', password: 'viewer123', roles: ['role-004'],
    });
    expect(mk.status).toBe(201);
    const token = await loginAs(ctx.app, ctx.env, 'viewer@hotel.com', 'viewer123');
    const me = await call('GET', '/api/auth/me', token);
    expect(me.json.data.permissions).toEqual([]);
    expect((await call('GET', '/api/roles/role-004', admin)).json.data.status).toBe('inactive');
  });
});

describe('known-unsafe: BE-023 (Block 3) missing audit rows', () => {
  it('user/role mutations and failed logins add NO activity rows today', async () => {
    const before = await activityTotal();
    await call('POST', '/api/users', admin, { name: 'Audit Gap', email: 'gap@hotel.com', password: 'gap12345', roles: ['role-003'] });
    await call('PUT', '/api/users/user-005/roles', admin, { roles: ['role-005'] });
    await call('POST', '/api/roles', admin, { name: 'Audit Gap Role' });
    await call('POST', '/api/auth/login', undefined, { email: 'admin@hotel.com', password: 'wrong-wrong' });
    expect(await activityTotal()).toBe(before);
  });
});

describe('known-unsafe: BE-017 / BE-024 / BE-025 (Block 4) reservation guards', () => {
  it('BE-017: a checked-out reservation can still be re-priced', async () => {
    const res = await call('PATCH', '/api/reservations/res-003', staff, {
      pricing: {
        mode: 'same',
        nightlyRates: [
          { date: '2026-09-10', rate: 1 },
          { date: '2026-09-11', rate: 1 },
        ],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.totalAmount).toBe(2);
  });

  it('BE-024: a maintenance room can be booked and the room number snapshot comes from the client', async () => {
    await call('PATCH', '/api/rooms/room-10', admin, { status: 'maintenance' });
    const res = await call('POST', '/api/reservations', staff, stay({ rooms: [{ roomId: 'room-10', roomNumber: '999', roomTypeName: 'Twin' }] }));
    expect(res.status).toBe(201);
    expect(res.json.data.rooms[0].roomNumber).toBe('999');
  });

  it('BE-025: an impossible calendar date (2027-02-31) is accepted and silently becomes 2027-03-03', async () => {
    const res = await call('POST', '/api/reservations', staff, stay({
      checkInDate: '2027-02-31',
      checkOutDate: '2027-03-05',
      pricing: {
        mode: 'same',
        nightlyRates: [
          { date: '2027-03-03', rate: 100000 },
          { date: '2027-03-04', rate: 100000 },
        ],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    }));
    expect(res.status).toBe(201);
    expect(res.json.data.checkInDate).toBe('2027-02-31');
  });

  it('BE-025: a 90-night stay is accepted and priced for only 60 nights', async () => {
    const nightlyRates: Array<{ date: string; rate: number }> = [];
    for (let d = new Date('2027-01-01T00:00:00Z'); d < new Date('2027-04-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      nightlyRates.push({ date: d.toISOString().slice(0, 10), rate: 100000 });
    }
    // 90 nights in the payload would hit the schema max(60) on nightlyRates, so
    // send 60 rates for a 90-night span, as the PoC does.
    const res = await call('POST', '/api/reservations', staff, stay({
      checkInDate: '2027-01-01',
      checkOutDate: '2027-04-01',
      pricing: { mode: 'same', nightlyRates: nightlyRates.slice(0, 60), paymentType: 'no_dp', dpType: 'percentage' },
    }));
    expect(res.status).toBe(201);
    expect(res.json.data.calc.nights).toBe(60);
    expect(res.json.data.totalAmount).toBe(6000000);
  });
});

describe('known-unsafe: BE-019 / BE-020 / BE-022 (Block 6) invoice lifecycle', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    guestName: 'Unsafe Invoice',
    source: 'direct',
    invoiceDate: '2026-09-18',
    items: [{ description: 'Room', quantity: 1, unitPrice: 1000000 }],
    ...over,
  });

  it('BE-020: an invoice can be created directly as Completed + Paid', async () => {
    const res = await call('POST', '/api/invoices', admin, body({ invoiceStatus: 'Completed', paymentStatus: 'Paid' }));
    expect(res.status).toBe(201);
    expect(res.json.data.invoiceStatus).toBe('Completed');
    expect(res.json.data.paymentStatus).toBe('Paid');
  });

  it('BE-019: a Paid invoice can be hard-deleted and its number is reused', async () => {
    const created = await call('POST', '/api/invoices', admin, body());
    const id = created.json.data.id as string;
    const number = created.json.data.invoiceNumber as string;
    await call('POST', `/api/invoices/${id}/send`, admin);
    await call('POST', `/api/invoices/${id}/pay`, admin);
    expect((await call('DELETE', `/api/invoices/${id}`, admin)).status).toBe(204);
    const next = await call('GET', '/api/invoices/next-number?date=2026-09-18', admin);
    expect(next.json.data.invoiceNumber).toBe(number);
  });

  it('BE-022: a Draft (unpaid) invoice already counts in sales', async () => {
    const before = await call('GET', '/api/sales?start=2026-09-18&end=2026-09-18&pageSize=100', admin);
    const created = await call('POST', '/api/invoices', admin, body());
    expect(created.json.data.invoiceStatus).toBe('Draft');
    const after = await call('GET', '/api/sales?start=2026-09-18&end=2026-09-18&pageSize=100', admin);
    expect(after.json.pagination.total).toBe(before.json.pagination.total + 1);
  });
});
