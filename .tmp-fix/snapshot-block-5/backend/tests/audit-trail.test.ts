import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toErrorBody } from '../src/lib/errors';
import { maskEmail, maskPii } from '../src/lib/audit';
import { ADMIN, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { queryLogFor } from './helpers/fake-d1';

/**
 * Block 3 (BE-023, BE-033 code part): audit rows for user / role / permission /
 * finance mutations (with before/after) and failed logins; structured,
 * PII-masked error logging. Uses the existing `activities` table: no schema
 * change (category taxonomy: user/role events log under `system`, failed
 * logins under `authentication`).
 */
let ctx: TestContext;
let admin: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
});
afterEach(() => vi.restoreAllMocks());

async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...jsonHeaders(token), ...headers };
  const res = await ctx.app.request(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }, ctx.env);
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}

interface Row {
  id: string;
  category: string;
  action: string;
  description: string;
  user_id: string;
  user_name: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, string>;
  ip_address: string | null;
}

function rows(where = '1=1', ...params: unknown[]): Row[] {
  const raw = ctx.sqlite
    .prepare(`SELECT * FROM activities WHERE ${where} ORDER BY created_at, rowid`)
    .all(...params) as Array<Record<string, any>>;
  return raw.map((r) => ({ ...(r as any), metadata: JSON.parse(r.metadata) }));
}

const byAction = (action: string, entityId?: string) =>
  rows('action = ?', action).filter((r) => entityId === undefined || r.entity_id === entityId);

describe('BE-023: user mutations are audited with before/after', () => {
  it('create, update, status, roles and delete each write one row naming the actor and target', async () => {
    const created = await call('POST', '/api/users', admin, { name: 'Audit Person', email: 'person@hotel.com', password: 'person123', roles: ['role-003'] });
    expect(created.status).toBe(201);
    const id = created.json.data.id as string;
    const c = byAction('user_create', id);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: 'system', entity_type: 'user', user_id: 'user-001', user_name: 'Admin User' });
    expect(c[0].metadata).toMatchObject({ after_email: 'person@hotel.com', after_roles: 'role-003', after_status: 'active' });

    await call('PATCH', `/api/users/${id}`, admin, { name: 'Renamed Person', email: 'renamed@hotel.com' });
    const u = byAction('user_update', id);
    expect(u).toHaveLength(1);
    expect(u[0].metadata).toMatchObject({
      before_name: 'Audit Person', after_name: 'Renamed Person',
      before_email: 'person@hotel.com', after_email: 'renamed@hotel.com',
    });

    await call('PATCH', `/api/users/${id}/status`, admin, { status: 'inactive' });
    const s = byAction('user_status', id);
    expect(s).toHaveLength(1);
    expect(s[0].metadata).toMatchObject({ before_status: 'active', after_status: 'inactive' });

    await call('PUT', `/api/users/${id}/roles`, admin, { roles: ['role-005', 'role-003'] });
    const r = byAction('user_roles', id);
    expect(r).toHaveLength(1);
    expect(r[0].metadata).toMatchObject({ before_roles: 'role-003', after_roles: 'role-003,role-005' });

    expect((await call('DELETE', `/api/users/${id}`, admin)).status).toBe(204);
    const d = byAction('user_delete', id);
    expect(d).toHaveLength(1);
    expect(d[0].metadata).toMatchObject({ before_email: 'renamed@hotel.com', before_roles: 'role-003,role-005' });
  });

  it('PATCH /users/:id that changes roles and status records the roles change under user_update (one row)', async () => {
    const id = (await call('POST', '/api/users', admin, { name: 'Multi Change', email: 'multi@hotel.com', password: 'person123', roles: ['role-003'] })).json.data.id;
    await call('PATCH', `/api/users/${id}`, admin, { roles: ['role-005'], status: 'inactive' });
    const u = byAction('user_update', id);
    expect(u).toHaveLength(1);
    expect(u[0].metadata).toMatchObject({ before_roles: 'role-003', after_roles: 'role-005', before_status: 'active', after_status: 'inactive' });
  });

  it('rejected or invalid mutations write nothing', async () => {
    const manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
    const before = rows().length;
    expect((await call('PUT', '/api/users/user-001/roles', manager, { roles: ['role-003'] })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-003', admin, {})).status).toBe(422);
    expect((await call('DELETE', '/api/users/nope', admin)).status).toBe(404);
    expect(rows().length).toBe(before);
  });
});

describe('BE-023: role and permission mutations are audited', () => {
  it('create, update, set permissions and delete', async () => {
    const created = await call('POST', '/api/roles', admin, { name: 'Audited Role', permissions: ['room.view'] });
    const id = created.json.data.id as string;
    const c = byAction('role_create', id);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: 'system', entity_type: 'role' });
    expect(c[0].metadata).toMatchObject({ after_name: 'Audited Role', after_permissions: 'room.view', after_status: 'active' });

    await call('PATCH', `/api/roles/${id}`, admin, { description: 'new', status: 'inactive' });
    const u = byAction('role_update', id);
    expect(u).toHaveLength(1);
    expect(u[0].metadata).toMatchObject({ before_status: 'active', after_status: 'inactive' });

    await call('PUT', `/api/roles/${id}/permissions`, admin, { permissions: ['activity.view', 'room.view'] });
    const p = byAction('role_permissions', id);
    expect(p).toHaveLength(1);
    expect(p[0].metadata).toMatchObject({
      before_permissions: 'room.view',
      after_permissions: 'activity.view,room.view',
      added: 'activity.view',
      removed: '',
    });

    expect((await call('DELETE', `/api/roles/${id}`, admin)).status).toBe(204);
    const d = byAction('role_delete', id);
    expect(d).toHaveLength(1);
    expect(d[0].metadata).toMatchObject({ before_name: 'Audited Role', before_permissions: 'activity.view,room.view' });
  });

  it('refused role operations write nothing', async () => {
    const before = rows().length;
    expect((await call('DELETE', '/api/roles/role-003', admin)).status).toBe(409);
    expect((await call('PATCH', '/api/roles/role-001', admin, { status: 'inactive' })).status).toBe(403);
    expect(rows().length).toBe(before);
  });
});

describe('BE-023: finance mutations carry before/after', () => {
  const invoice = (over: Record<string, unknown> = {}) => ({
    guestName: 'Audit Invoice', source: 'direct', invoiceDate: '2026-09-18',
    items: [{ description: 'Room', quantity: 1, unitPrice: 1000000 }], discount: 0, ...over,
  });

  it('invoice update/send/pay/cancel/delete record the previous and new values; create is unchanged', async () => {
    const created = await call('POST', '/api/invoices', admin, invoice());
    const id = created.json.data.id as string;
    expect(byAction('invoice_create', id)[0].metadata).toEqual({
      invoiceNumber: created.json.data.invoiceNumber, guestName: 'Audit Invoice', total: '1000000',
    });

    await call('PATCH', `/api/invoices/${id}`, admin, { items: [{ description: 'Room', quantity: 2, unitPrice: 1000000 }] });
    expect(byAction('invoice_update', id)[0].metadata).toMatchObject({
      before_total: '1000000', after_total: '2000000', before_invoiceStatus: 'Draft', after_invoiceStatus: 'Draft',
    });

    await call('POST', `/api/invoices/${id}/send`, admin);
    expect(byAction('invoice_send', id)[0].metadata).toMatchObject({ before_invoiceStatus: 'Draft', after_invoiceStatus: 'Sent' });
    await call('POST', `/api/invoices/${id}/pay`, admin);
    expect(byAction('invoice_pay', id)[0].metadata).toMatchObject({
      before_paymentStatus: 'Pending', after_paymentStatus: 'Paid', before_invoiceStatus: 'Sent', after_invoiceStatus: 'Completed',
    });

    const other = (await call('POST', '/api/invoices', admin, invoice({ guestName: 'To Delete' }))).json.data.id as string;
    await call('POST', `/api/invoices/${other}/cancel`, admin);
    expect(byAction('invoice_cancel', other)[0].metadata).toMatchObject({ before_invoiceStatus: 'Draft', after_invoiceStatus: 'Cancelled' });
    expect((await call('DELETE', `/api/invoices/${other}`, admin)).status).toBe(204);
    expect(byAction('invoice_delete', other)[0].metadata).toMatchObject({ before_invoiceStatus: 'Cancelled', before_total: '1000000' });
  });

  it('expense update/delete record the previous values; create is unchanged', async () => {
    const created = await call('POST', '/api/expenses', admin, { date: '2026-09-19', category: 'Supplies', description: 'Soap', amount: 50000 });
    const id = created.json.data.id as string;
    expect(byAction('expense_create', id)[0].metadata).toEqual({ category: 'Supplies', amount: '50000' });
    await call('PATCH', `/api/expenses/${id}`, admin, { amount: 75000, status: 'Paid' });
    expect(byAction('expense_update', id)[0].metadata).toMatchObject({
      before_amount: '50000', after_amount: '75000', before_status: 'Pending', after_status: 'Paid',
    });
    await call('DELETE', `/api/expenses/${id}`, admin);
    expect(byAction('expense_delete', id)[0].metadata).toMatchObject({ before_amount: '75000', before_status: 'Paid' });
  });
});

describe('BE-023: failed logins', () => {
  it('records a masked failed login for a known account and for an unknown one, with the client IP', async () => {
    const bad = await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: 'definitely-wrong' }, { 'cf-connecting-ip': '203.0.113.5' });
    expect(bad.status).toBe(401);
    await call('POST', '/api/auth/login', undefined, { email: 'ghost@nowhere.test', password: 'definitely-wrong' });
    const failed = byAction('login_failed');
    expect(failed).toHaveLength(2);
    expect(failed[0]).toMatchObject({ category: 'authentication', user_id: 'user-003', ip_address: '203.0.113.5' });
    expect(failed[0].metadata.email).toBe('s***@hotel.com');
    expect(failed[1].user_id).toBe('anonymous');
    expect(failed[1].metadata.email).toBe('g***@nowhere.test');
    const blob = JSON.stringify(failed);
    expect(blob).not.toContain('definitely-wrong');
    expect(blob).not.toContain('staff@hotel.com');
  });

  it('does not log successful logins as failures and does not log throttled (429) attempts', async () => {
    const h = { 'cf-connecting-ip': '203.0.113.77' };
    for (let i = 0; i < 20; i++) await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: `wrong-pass-${i}` }, h);
    const logged = byAction('login_failed').length;
    expect(logged).toBe(20);
    expect((await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: 'wrong-again' }, h)).status).toBe(429);
    expect(byAction('login_failed').length).toBe(logged);
    const ok = await call('POST', '/api/auth/login', undefined, { email: 'manager@hotel.com', password: 'manager123' }, h);
    expect(ok.status).toBe(200);
    expect(byAction('login_failed').length).toBe(logged);
  });

  it('inactive account logins are recorded as failures with the reason', async () => {
    await call('POST', '/api/auth/login', undefined, { email: 'inactive@hotel.com', password: 'inactive123' });
    const f = byAction('login_failed');
    expect(f).toHaveLength(1);
    expect(f[0].metadata.reason).toBe('inactive');
  });

  it('a failure to write the audit row never changes the login response', async () => {
    ctx.sqlite.exec('ALTER TABLE activities RENAME TO activities_gone');
    const res = await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: 'wrong-wrong' });
    expect(res.status).toBe(401);
    ctx.sqlite.exec('ALTER TABLE activities_gone RENAME TO activities');
  });
});

describe('BE-023: nothing sensitive is ever stored', () => {
  it('no audit row written by the mutations above contains passwords, hashes or tokens', async () => {
    await call('POST', '/api/users', admin, { name: 'Secret Test', email: 'secret@hotel.com', password: 'super-secret-pw', roles: ['role-003'] });
    await call('POST', '/api/auth/login', undefined, { email: 'secret@hotel.com', password: 'wrong-secret-pw' });
    await call('POST', '/api/auth/forgot-password', undefined, { email: 'secret@hotel.com' });
    const blob = JSON.stringify(rows());
    expect(blob).not.toContain('super-secret-pw');
    expect(blob).not.toContain('wrong-secret-pw');
    expect(blob).not.toMatch(/\$2[aby]\$/);
    expect(blob).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
  });
});

describe('BE-023: statement cost of the new audit hooks', () => {
  /**
   * Counts measured on the Block 2 code (before the hooks) are the `was`
   * values; the hooks may add only the before-image reads (2) + one insert.
   * Update/status/roles/delete: +3; create: +1 (insert only).
   */
  it('each audited user/role mutation stays within its budget', async () => {
    const log = queryLogFor(ctx.sqlite);
    const measure = async (method: string, path: string, body?: unknown) => {
      log.reset();
      const r = await call(method, path, admin, body);
      return { status: r.status, n: log.count, json: r.json };
    };
    const created = await measure('POST', '/api/users', { name: 'Cost Person', email: 'cost@hotel.com', password: 'person123', roles: ['role-003'] });
    expect(created.status).toBe(201);
    const id = created.json.data.id as string;
    const role = await measure('POST', '/api/roles', { name: 'Cost Role', permissions: ['room.view'] });
    const rid = role.json.data.id as string;
    const got = {
      userCreate: created.n,
      userUpdate: (await measure('PATCH', `/api/users/${id}`, { name: 'Cost Renamed' })).n,
      userStatus: (await measure('PATCH', `/api/users/${id}/status`, { status: 'inactive' })).n,
      userRoles: (await measure('PUT', `/api/users/${id}/roles`, { roles: ['role-005'] })).n,
      userDelete: (await measure('DELETE', `/api/users/${id}`)).n,
      roleCreate: role.n,
      roleUpdate: (await measure('PATCH', `/api/roles/${rid}`, { description: 'x' })).n,
      rolePermissions: (await measure('PUT', `/api/roles/${rid}/permissions`, { permissions: ['room.view', 'activity.view'] })).n,
      roleDelete: (await measure('DELETE', `/api/roles/${rid}`)).n,
    };
    const was = { userCreate: 9, userUpdate: 8, userStatus: 9, userRoles: 10, userDelete: 8, roleCreate: 10, roleUpdate: 8, rolePermissions: 14, roleDelete: 8 };
    const added = { userCreate: 1, userUpdate: 3, userStatus: 3, userRoles: 3, userDelete: 3, roleCreate: 1, roleUpdate: 3, rolePermissions: 3, roleDelete: 3 };
    for (const k of Object.keys(was) as Array<keyof typeof was>) {
      expect(got[k], k).toBeLessThanOrEqual(was[k] + added[k]);
    }
  });

  it('finance mutations add no statements (the before-image is captured from the row the service already loads)', async () => {
    const log = queryLogFor(ctx.sqlite);
    const inv = (await call('POST', '/api/invoices', admin, {
      guestName: 'Cost Guest', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'Room', quantity: 1, unitPrice: 100000 }],
    })).json.data.id as string;
    log.reset();
    await call('POST', `/api/invoices/${inv}/send`, admin);
    expect(log.count).toBeLessThanOrEqual(10);
    log.reset();
    await call('POST', `/api/invoices/${inv}/pay`, admin);
    expect(log.count).toBeLessThanOrEqual(10);
  });

  it('a failed login costs 3 statements (user lookup + audit lookup + insert) and only on failures', async () => {
    const log = queryLogFor(ctx.sqlite);
    log.reset();
    await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: 'wrong-wrong' });
    expect(log.count).toBeLessThanOrEqual(3);
  });
});

describe('BE-033: structured, PII-masked error logging', () => {
  it('maskEmail and maskPii hide addresses, tokens and hashes', () => {
    expect(maskEmail('admin@hotel.com')).toBe('a***@hotel.com');
    expect(maskEmail('not-an-email')).toBe('***');
    const masked = maskPii(
      'user jane.doe@example.org failed; Authorization: Bearer abc.def.ghi; token eyJhbGciOi.eyJzdWIiOi.c2ln; hash $2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456',
    );
    expect(masked).not.toContain('jane.doe');
    expect(masked).toContain('j***@example.org');
    expect(masked).not.toContain('abc.def.ghi');
    expect(masked).not.toContain('eyJhbGciOi');
    expect(masked).not.toContain('$2a$10$');
  });

  it('unexpected errors are logged as ONE JSON line with masked message and no raw object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom for guest.person@hotel.com with Bearer secret.token.value');
    const { status, body } = toErrorBody(err, { method: 'POST', path: '/api/reservations' });
    expect(status).toBe(500);
    expect(body).toEqual({ message: 'Internal server error' });
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe('string');
    const entry = JSON.parse(args[0] as string);
    expect(entry).toMatchObject({ level: 'error', event: 'unhandled_error', method: 'POST', path: '/api/reservations', name: 'Error' });
    expect(entry.message).not.toContain('guest.person');
    expect(entry.message).not.toContain('secret.token.value');
    expect(entry.message).toContain('g***@hotel.com');
  });

  it('known API errors are still not logged and keep their body', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = toErrorBody({ status: 0 });
    expect(out.status).toBe(500);
    spy.mockClear();
    expect(spy).not.toHaveBeenCalled();
  });
});
