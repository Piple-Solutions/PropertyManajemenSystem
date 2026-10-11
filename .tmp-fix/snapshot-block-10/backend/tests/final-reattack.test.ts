import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { backendRoot, setShimLatency } from './helpers/fake-d1';

/**
 * Block 10.2 — adversarial re-attack of every Critical/High finding
 * (BE-001, 002, 003, 004, 015, 016, 017, 019, 023). Each test tries to reach
 * the same damage through a DIFFERENT door than the original PoC: other
 * endpoints, other request orders, concurrency, boundary values.
 */
let ctx: TestContext;
let admin: string;
let manager: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await ctx.app.request(
    path,
    { method, headers: { ...jsonHeaders(token), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) },
    ctx.env,
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function nights(from: string, count: number, rate = 300000) {
  const out: Array<{ date: string; rate: number }> = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    out.push({ date: d.toISOString().slice(0, 10), rate });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function end(from: string, count: number) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
function stay(roomIds: string[], from: string, count: number, guest = 'Attack Guest') {
  return {
    guestName: guest,
    source: 'direct',
    checkInDate: from,
    checkOutDate: end(from, count),
    notes: '',
    rooms: roomIds.map((roomId) => ({ roomId, roomNumber: 'x', roomTypeName: '' })),
    pricing: { mode: 'same', nightlyRates: nights(from, count), paymentType: 'no_dp', dpType: 'percentage' },
  };
}
const userCount = () => (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
const overlapping = (roomId: string) =>
  ctx.sqlite
    .prepare(
      "SELECT a.id AS a, b.id AS b FROM reservation_rooms ra JOIN reservations a ON a.id = ra.reservation_id JOIN reservation_rooms rb ON rb.room_id = ra.room_id JOIN reservations b ON b.id = rb.reservation_id WHERE ra.room_id = ? AND a.id < b.id AND a.status != 'cancelled' AND b.status != 'cancelled' AND a.check_in_date < b.check_out_date AND b.check_in_date < a.check_out_date",
    )
    .all(roomId).length;

describe('re-attack BE-001: no way to self-register', () => {
  it('path, method and header variants never create an account', async () => {
    const before = userCount();
    const body = { name: 'Anon User', email: 'anon@evil.test', password: 'anon1234' };
    const attempts: Array<[string, string, Record<string, string>]> = [
      ['POST', '/api/auth/register', {}],
      ['POST', '/api/auth/register/', {}],
      ['POST', '/api/auth/Register', {}],
      ['POST', '/api/auth/register?force=true&enabled=1', {}],
      ['PUT', '/api/auth/register', {}],
      ['PATCH', '/api/auth/register', {}],
      ['POST', '/api/auth/register', { 'X-HTTP-Method-Override': 'POST', 'X-Forwarded-Host': 'localhost' }],
      ['POST', '/api//auth/register', {}],
    ];
    for (const [method, path, headers] of attempts) {
      const res = await call(method, path, undefined, body, headers);
      expect([403, 404, 405], `${method} ${path}`).toContain(res.status);
      expect(res.json?.data?.token, `${method} ${path}`).toBeUndefined();
    }
    // A localhost-looking absolute URL does not re-open it either (the switch is a code constant).
    const local = await ctx.app.request('http://localhost:8787/api/auth/register', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body) }, ctx.env);
    expect(local.status).toBe(403);
    expect(userCount()).toBe(before);
  });

  it('an anonymous caller cannot reach user creation or password reset of another account either', async () => {
    expect((await call('POST', '/api/users', undefined, { name: 'Anon', email: 'a@evil.test', password: 'anon1234', roles: ['role-003'] })).status).toBe(401);
    const deployed = await ctx.app.request('https://pms.example.workers.dev/api/auth/forgot-password', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: ADMIN.email }) }, ctx.env);
    expect(((await deployed.json()) as any).data.resetToken).toBeUndefined();
  });
});

describe('re-attack BE-002: the Super Admin cannot be reached through any user route', () => {
  it('every user-mutating route and field combination is refused for a Manager', async () => {
    const attempts: Array<[string, string, unknown]> = [
      ['PUT', '/api/users/user-001/roles', { roles: ['role-001', 'role-003'] }],
      ['PUT', '/api/users/user-001/roles', { roles: ['role-002'] }],
      ['PATCH', '/api/users/user-001', { name: 'x x', email: 'x@evil.test', status: 'inactive', roles: ['role-003'] }],
      ['PATCH', '/api/users/user-001', { status: 'active' }],
      ['PATCH', '/api/users/user-001/status', { status: 'active' }],
      ['DELETE', '/api/users/user-001', undefined],
    ];
    for (const [method, path, body] of attempts) {
      expect((await call(method, path, manager, body)).status, `${method} ${path} ${JSON.stringify(body)}`).toBe(403);
    }
    const row = ctx.sqlite.prepare("SELECT name, email, status FROM users WHERE id = 'user-001'").get();
    expect(row).toEqual({ name: 'Admin User', email: 'admin@hotel.com', status: 'active' });
  });

  it('a Manager cannot become Super Admin (self-assign, new account, or via another Manager)', async () => {
    expect((await call('PUT', '/api/users/user-002/roles', manager, { roles: ['role-002', 'role-001'] })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-002', manager, { roles: ['role-001'] })).status).toBe(403);
    expect((await call('POST', '/api/users', manager, { name: 'Shadow Admin', email: 'shadow@evil.test', password: 'shadow123', roles: ['role-001'] })).status).toBe(403);
    const accomplice = await call('POST', '/api/users', manager, { name: 'Second Manager', email: 'm2@hotel.com', password: 'manager2x', roles: ['role-002'] });
    expect(accomplice.status).toBe(201);
    const m2 = await loginAs(ctx.app, ctx.env, 'm2@hotel.com', 'manager2x');
    expect((await call('PUT', '/api/users/user-002/roles', m2, { roles: ['role-001'] })).status).toBe(403);
    expect((await call('GET', '/api/auth/me', manager)).json.data.permissions).not.toContain('permission.assign');
  });

  it('a role administrator cannot neutralise the Super Admin role', async () => {
    const all = (await call('GET', '/api/permissions', admin)).json.data.map((p: any) => p.name) as string[];
    const roleAdmin = await call('POST', '/api/roles', admin, { name: 'Role Admin', permissions: all });
    await call('POST', '/api/users', admin, { name: 'Role Admin', email: 'roleadmin@hotel.com', password: 'roleadmin1', roles: [roleAdmin.json.data.id] });
    const token = await loginAs(ctx.app, ctx.env, 'roleadmin@hotel.com', 'roleadmin1');
    expect((await call('PATCH', '/api/roles/role-001', token, { status: 'inactive' })).status).toBe(403);
    expect((await call('PUT', '/api/roles/role-001/permissions', token, { permissions: [] })).status).toBe(403);
    expect((await call('DELETE', '/api/roles/role-001', token)).status).toBe(409);
    expect((await call('PATCH', '/api/users/user-001/status', token, { status: 'inactive' })).status).toBe(403);
    expect((await call('DELETE', '/api/users/user-001', token)).status).toBe(403);
    expect((await call('GET', '/api/users', admin)).status).toBe(200);
  });

  it('two Super Admins removing each other at the same moment: at least one always remains', async () => {
    await call('POST', '/api/users', admin, { name: 'Second Admin', email: 'admin2@hotel.com', password: 'admin2pass', roles: ['role-001'] });
    const second = (ctx.sqlite.prepare("SELECT id FROM users WHERE email = 'admin2@hotel.com'").get() as { id: string }).id;
    const admin2 = await loginAs(ctx.app, ctx.env, 'admin2@hotel.com', 'admin2pass');
    setShimLatency(ctx.sqlite, 5);
    await Promise.all([
      call('PUT', `/api/users/${second}/roles`, admin, { roles: ['role-003'] }),
      call('PUT', '/api/users/user-001/roles', admin2, { roles: ['role-003'] }),
    ]);
    setShimLatency(ctx.sqlite, 0);
    const remaining = (ctx.sqlite
      .prepare("SELECT COUNT(*) AS c FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role_id = 'role-001' AND u.status = 'active'")
      .get() as { c: number }).c;
    // Documented residual risk (check-then-write): record what actually happens.
    expect(remaining).toBeGreaterThanOrEqual(1);
    ctx.sqlite.exec(`CREATE TABLE IF NOT EXISTS _reattack (k TEXT, v INTEGER); INSERT INTO _reattack VALUES ('admins_left_after_mutual_demote', ${remaining});`);
  });
});

describe('re-attack BE-003: no permission can be gained through roles', () => {
  async function actor(permissions: string[], email: string) {
    const role = await call('POST', '/api/roles', admin, { name: `R ${email}`, permissions });
    const user = await call('POST', '/api/users', admin, { name: 'Actor Person', email, password: 'actor1234', roles: [role.json.data.id] });
    return { roleId: role.json.data.id as string, userId: user.json.data.id as string, token: await loginAs(ctx.app, ctx.env, email, 'actor1234') };
  }
  const permsOf = async (token: string) => (await call('GET', '/api/auth/me', token)).json.data.permissions as string[];

  it('an actor with every role/user admin permission EXCEPT the target one cannot obtain it by any route', async () => {
    const a = await actor(['user.view', 'user.create', 'user.update', 'role.view', 'role.create', 'role.update', 'permission.view', 'permission.assign'], 'climber@hotel.com');
    const before = (await permsOf(a.token)).sort();
    const tries = [
      await call('PUT', `/api/roles/${a.roleId}/permissions`, a.token, { permissions: [...before, 'user.delete'] }),
      await call('POST', '/api/roles', a.token, { name: 'Ladder', permissions: ['finance.invoice.delete'] }),
      await call('PUT', `/api/users/${a.userId}/roles`, a.token, { roles: [a.roleId, 'role-002'] }),
      await call('PATCH', `/api/users/${a.userId}`, a.token, { roles: ['role-001'] }),
      await call('POST', '/api/users', a.token, { name: 'Sock Puppet', email: 'sock@hotel.com', password: 'sock12345', roles: ['role-002'] }),
      await call('PUT', '/api/roles/role-003/permissions', a.token, { permissions: ['room.view', 'user.delete'] }),
    ];
    for (const t of tries) expect(t.status).toBe(403);
    expect((await permsOf(a.token)).sort()).toEqual(before);
  });

  it('granting through an inactive role that is later re-activated gains nothing beyond what the actor already holds', async () => {
    const big = await call('POST', '/api/roles', admin, { name: 'Dormant Big', permissions: ['user.delete', 'role.delete'], status: 'inactive' });
    const a = await actor(['user.view', 'user.update', 'role.view', 'role.update'], 'dormant@hotel.com');
    expect((await call('PUT', `/api/users/${a.userId}/roles`, a.token, { roles: [a.roleId, big.json.data.id] })).status).toBe(403);
    expect((await call('PATCH', `/api/roles/${big.json.data.id}`, a.token, { status: 'active' })).status).toBe(403);
    expect(await permsOf(a.token)).not.toContain('user.delete');
  });
});

describe('re-attack BE-004: the seed guard cannot be satisfied by look-alike switches', () => {
  it('only the exact flag or env value passes', () => {
    const script = resolve(backendRoot, 'scripts', 'generate-seed-sql.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'pms-reattack-'));
    const run = (args: string[], env: Record<string, string>) => {
      const out = join(dir, `s-${Math.random().toString(16).slice(2)}.sql`);
      const r = spawnSync('node', [script, `--out=${out}`, ...args], { cwd: backendRoot, env: { ...process.env, PMS_ALLOW_DEFAULT_CREDENTIALS: '', ...env }, encoding: 'utf8' });
      return { status: r.status, written: existsSync(out), stderr: r.stderr };
    };
    for (const [args, env] of [
      [['--allow-default-credential'], {}],
      [['--allow'], {}],
      [['--allow-default-credentials=false'], {}],
      [['-allow-default-credentials'], {}],
      [[], { PMS_ALLOW_DEFAULT_CREDENTIALS: 'true' }],
      [[], { PMS_ALLOW_DEFAULT_CREDENTIALS: '0' }],
      [[], { pms_allow_default_credentials: '1' }],
    ] as Array<[string[], Record<string, string>]>) {
      const r = run(args, env);
      // On Windows environment names are case-insensitive: the lower-case variable IS the variable.
      if (process.platform === 'win32' && 'pms_allow_default_credentials' in env) continue;
      expect(r.status, JSON.stringify([args, env])).not.toBe(0);
      expect(r.written, JSON.stringify([args, env])).toBe(false);
      expect(r.stderr).not.toMatch(/admin123|manager123|staff123/);
    }
    expect(run(['--allow-default-credentials'], {}).written).toBe(true);
  });
});

describe('re-attack BE-015 / BE-016: no interleaving produces two bookings for one room-night', () => {
  it('ten simultaneous requests, mixed single/multi-room and partial overlaps', async () => {
    setShimLatency(ctx.sqlite, 3);
    const reqs = [
      stay(['room-01'], '2028-01-10', 3), stay(['room-01'], '2028-01-11', 1), stay(['room-01', 'room-02'], '2028-01-12', 2),
      stay(['room-02'], '2028-01-10', 5), stay(['room-01'], '2028-01-09', 2), stay(['room-02', 'room-03'], '2028-01-13', 1),
      stay(['room-01'], '2028-01-10', 3), stay(['room-03', 'room-01'], '2028-01-08', 4), stay(['room-02'], '2028-01-14', 1), stay(['room-01'], '2028-01-12', 1),
    ];
    const results = await Promise.all(reqs.map((r, i) => call('POST', '/api/reservations', i % 2 ? admin : staff, r)));
    setShimLatency(ctx.sqlite, 0);
    for (const r of results) expect([201, 409]).toContain(r.status);
    expect(results.some((r) => r.status === 201)).toBe(true);
    for (const room of ['room-01', 'room-02', 'room-03']) expect(overlapping(room), room).toBe(0);
    const orphans = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservation_rooms WHERE reservation_id NOT IN (SELECT id FROM reservations)').get() as { c: number };
    expect(orphans.c).toBe(0);
  });

  it('a create racing an edit, a date-move and a room-swap onto the same nights', async () => {
    const a = (await call('POST', '/api/reservations', staff, stay(['room-04'], '2028-02-01', 2, 'Guest A'))).json.data;
    const b = (await call('POST', '/api/reservations', staff, stay(['room-05'], '2028-02-10', 2, 'Guest B'))).json.data;
    setShimLatency(ctx.sqlite, 4);
    const results = await Promise.all([
      call('POST', '/api/reservations', staff, stay(['room-06'], '2028-02-01', 2, 'Guest New')),
      call('PATCH', `/api/reservations/${a.id}`, staff, { rooms: [{ roomId: 'room-06', roomNumber: 'x' }] }),
      call('PATCH', `/api/reservations/${b.id}`, staff, {
        checkInDate: '2028-02-01', checkOutDate: '2028-02-03', rooms: [{ roomId: 'room-06', roomNumber: 'x' }],
        pricing: { mode: 'same', nightlyRates: nights('2028-02-01', 2), paymentType: 'no_dp', dpType: 'percentage' },
      }),
    ]);
    setShimLatency(ctx.sqlite, 0);
    expect(results.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(1);
    expect(overlapping('room-06')).toBe(0);
    // Losers are intact: header dates still match their nightly rows.
    for (const id of [a.id, b.id]) {
      const full = (await call('GET', `/api/reservations/${id}`, staff)).json.data;
      expect(full.calc.nightDates[0]).toBe(full.checkInDate);
      expect(full.totalAmount).toBe(full.calc.roomTotal);
    }
  });

  it('checked-in and checked-out stays still block the room; boundary days do not', async () => {
    const a = (await call('POST', '/api/reservations', staff, stay(['room-07'], '2028-03-01', 2))).json.data;
    await call('POST', `/api/reservations/${a.id}/check-in`, staff);
    expect((await call('POST', '/api/reservations', staff, stay(['room-07'], '2028-03-02', 1))).status).toBe(409);
    await call('POST', `/api/reservations/${a.id}/check-out`, staff);
    expect((await call('POST', '/api/reservations', staff, stay(['room-07'], '2028-03-01', 1))).status).toBe(409);
    expect((await call('POST', '/api/reservations', staff, stay(['room-07'], '2028-03-03', 1))).status).toBe(201);
    expect((await call('POST', '/api/reservations', staff, stay(['room-07'], '2028-02-28', 2))).status).toBe(201);
  });
});

describe('re-attack BE-017: a closed reservation cannot be changed by any payload shape', () => {
  it('reordered, partial, padded and disguised payloads on checked-out and cancelled reservations', async () => {
    const r = (await call('POST', '/api/reservations', staff, stay(['room-08', 'room-09'], '2028-04-01', 2))).json.data;
    await call('POST', `/api/reservations/${r.id}/check-in`, staff);
    await call('POST', `/api/reservations/${r.id}/check-out`, staff);
    const c = (await call('POST', '/api/reservations', staff, stay(['room-10'], '2028-04-10', 2))).json.data;
    await call('POST', `/api/reservations/${c.id}/cancel`, admin);
    const snap = (id: string) => JSON.stringify({
      h: ctx.sqlite.prepare('SELECT check_in_date, check_out_date, total_amount, status, pricing_mode, payment_type, dp_type, dp_percentage, dp_fixed_amount FROM reservations WHERE id = ?').get(id),
      n: ctx.sqlite.prepare('SELECT date, rate FROM reservation_nightly_rates WHERE reservation_id = ? ORDER BY date').all(id),
      r: ctx.sqlite.prepare('SELECT room_id, room_number, rate, subtotal FROM reservation_rooms WHERE reservation_id = ? ORDER BY room_id').all(id),
    });
    const before = { [r.id]: snap(r.id), [c.id]: snap(c.id) };
    const same = { mode: 'same', nightlyRates: nights('2028-04-01', 2), paymentType: 'no_dp', dpType: 'percentage' };
    const refused: unknown[] = [
      { pricing: { ...same, nightlyRates: nights('2028-04-01', 2, 299999) } },
      { pricing: { ...same, nightlyRates: [...nights('2028-04-01', 2), { date: '2028-04-03', rate: 300000 }] }, checkOutDate: '2028-04-04' },
      { pricing: { ...same, mode: 'different' } },
      { pricing: { ...same, paymentType: 'dp', dpPercentage: 50 } },
      { pricing: { ...same, paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 1 } },
      { rooms: [{ roomId: 'room-08', roomNumber: 'x' }] },
      { rooms: [{ roomId: 'room-08', roomNumber: 'x' }, { roomId: 'room-09', roomNumber: 'x' }, { roomId: 'room-11', roomNumber: 'x' }] },
      { checkOutDate: '2028-04-04' },
      { checkInDate: '2028-03-31' },
      { notes: 'looks harmless', pricing: { ...same, nightlyRates: nights('2028-04-01', 2, 1) } },
    ];
    for (const body of refused) {
      const res = await call('PATCH', `/api/reservations/${r.id}`, staff, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
    }
    // Same room set in another order + same rates is NOT a change.
    const ok = await call('PATCH', `/api/reservations/${r.id}`, staff, {
      rooms: [{ roomId: 'room-09', roomNumber: 'x' }, { roomId: 'room-08', roomNumber: 'x' }], pricing: same, notes: 'ok',
    });
    expect(ok.status).toBe(200);
    for (const body of [{ pricing: { ...same, nightlyRates: nights('2028-04-10', 2, 1) } }, { rooms: [{ roomId: 'room-11', roomNumber: 'x' }] }, { checkOutDate: '2028-04-13' }]) {
      expect((await call('PATCH', `/api/reservations/${c.id}`, admin, body)).status, JSON.stringify(body)).toBe(409);
    }
    expect(snap(r.id)).toBe(before[r.id]);
    expect(snap(c.id)).toBe(before[c.id]);
    // No transition re-opens a closed reservation.
    for (const id of [r.id, c.id]) {
      for (const action of ['check-in', 'check-out', 'cancel']) expect((await call('POST', `/api/reservations/${id}/${action}`, admin)).status).toBe(409);
    }
  });
});

describe('re-attack BE-019: a non-Draft invoice cannot be made to disappear', () => {
  const invoice = (n: string) => ({ invoiceNumber: n, guestName: 'Attack Invoice', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'Room', quantity: 1, unitPrice: 1000000 }] });
  const exists = (id: string) => (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoices WHERE id = ?').get(id) as { c: number }).c === 1;

  it('status rewind, cancel-then-delete and number takeover all fail', async () => {
    const paid = (await call('POST', '/api/invoices', admin, invoice('INV-2026-500'))).json.data;
    await call('POST', `/api/invoices/${paid.id}/pay`, admin);
    expect((await call('PATCH', `/api/invoices/${paid.id}`, admin, { invoiceStatus: 'Draft', paymentStatus: 'Pending' })).status).not.toBe(200);
    expect((await call('DELETE', `/api/invoices/${paid.id}`, admin)).status).toBe(409);
    const sent = (await call('POST', '/api/invoices', admin, invoice('INV-2026-501'))).json.data;
    await call('POST', `/api/invoices/${sent.id}/send`, admin);
    expect((await call('PATCH', `/api/invoices/${sent.id}`, admin, { invoiceStatus: 'Draft' })).status).toBe(422);
    await call('POST', `/api/invoices/${sent.id}/cancel`, admin);
    expect((await call('DELETE', `/api/invoices/${sent.id}`, admin)).status).toBe(409);
    expect(exists(paid.id) && exists(sent.id)).toBe(true);
    // Another invoice cannot take a paid invoice's number.
    const thief = await call('POST', '/api/invoices', admin, invoice('INV-2026-500'));
    expect(thief.status).toBe(201);
    expect(thief.json.data.invoiceNumber).not.toBe('INV-2026-500');
    const draft = (await call('POST', '/api/invoices', admin, invoice('INV-2026-502'))).json.data;
    expect((await call('PATCH', `/api/invoices/${draft.id}`, admin, { invoiceNumber: 'INV-2026-500' })).json.data.invoiceNumber).not.toBe('INV-2026-500');
  });

  it('pay racing delete: the invoice is never both paid and gone', async () => {
    for (let i = 0; i < 6; i += 1) {
      const inv = (await call('POST', '/api/invoices', admin, invoice(`INV-2026-6${String(i).padStart(2, '0')}`))).json.data;
      setShimLatency(ctx.sqlite, 4);
      const [first, second] = i % 2 === 0
        ? await Promise.all([call('POST', `/api/invoices/${inv.id}/pay`, admin), call('DELETE', `/api/invoices/${inv.id}`, admin)])
        : await Promise.all([call('DELETE', `/api/invoices/${inv.id}`, admin), call('POST', `/api/invoices/${inv.id}/pay`, admin)]);
      setShimLatency(ctx.sqlite, 0);
      const payRes = i % 2 === 0 ? first : second;
      const delRes = i % 2 === 0 ? second : first;
      const row = ctx.sqlite.prepare('SELECT invoice_status AS s FROM invoices WHERE id = ?').get(inv.id) as { s: string } | undefined;
      if (delRes.status === 204) {
        expect(row).toBeUndefined();
        expect(payRes.status).not.toBe(200);
      } else {
        expect(delRes.status).toBe(409);
        expect(row?.s).toBe('Completed');
        expect(payRes.status).toBe(200);
      }
      const orphanItems = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)').get() as { c: number };
      expect(orphanItems.c).toBe(0);
    }
  });
});

describe('re-attack BE-023: sensitive changes cannot be made without leaving a trace', () => {
  const audit = () => ctx.sqlite.prepare('SELECT action, entity_id AS e, user_id AS u, metadata AS m FROM activities ORDER BY created_at, rowid').all() as Array<{ action: string; e: string; u: string; m: string }>;

  it('every alternate route to change roles/status/permissions is audited; the log itself is not writable', async () => {
    const before = audit().length;
    await call('PATCH', '/api/users/user-005', admin, { roles: ['role-005'], status: 'inactive' }); // roles via PATCH, not PUT
    await call('PATCH', '/api/users/user-005', admin, { status: 'active' }); // status via PATCH, not /status
    const role = await call('POST', '/api/roles', admin, { name: 'Quiet Role', permissions: ['room.view'] }); // permissions at creation
    await call('PATCH', `/api/roles/${role.json.data.id}`, admin, { status: 'inactive' });
    await call('PUT', `/api/roles/${role.json.data.id}/permissions`, admin, { permissions: [] });
    await call('POST', '/api/auth/login', undefined, { email: 'manager@hotel.com', password: 'guess-guess' });
    const rows = audit().slice(before);
    expect(rows.map((r) => r.action)).toEqual(['user_update', 'user_update', 'role_create', 'role_update', 'role_permissions', 'login_failed']);
    expect(JSON.parse(rows[0].m)).toMatchObject({ before_roles: 'role-003', after_roles: 'role-005', before_status: 'active', after_status: 'inactive' });
    expect(JSON.parse(rows[4].m)).toMatchObject({ before_permissions: 'room.view', after_permissions: '', removed: 'room.view' });
    expect(rows.every((r) => r.u === 'user-001' || r.action === 'login_failed')).toBe(true);
    for (const [method, path] of [['POST', '/api/activities'], ['DELETE', '/api/activities/act-001'], ['PATCH', '/api/activities/act-001'], ['PUT', '/api/activities/act-001'], ['DELETE', '/api/activities']] as const) {
      expect((await call(method, path, admin, {})).status, `${method} ${path}`).toBe(404);
    }
    expect(audit().length).toBe(before + 6);
    expect(JSON.stringify(rows)).not.toMatch(/guess-guess|\$2[aby]\$/);
  });

  it('refused attempts (the attacks above) do not forge audit rows in the attacker\'s favour', async () => {
    const before = audit().length;
    await call('PUT', '/api/users/user-001/roles', manager, { roles: ['role-003'] });
    await call('POST', '/api/auth/register', undefined, { name: 'Anon User', email: 'anon@evil.test', password: 'anon1234' });
    expect(audit().length).toBe(before);
  });
});
