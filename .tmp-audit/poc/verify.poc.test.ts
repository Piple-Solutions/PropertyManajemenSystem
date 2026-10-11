// READ-ONLY verification PoCs: run against the in-memory SQLite D1 shim only.
// Reuses the project's own test harness; modifies nothing outside .tmp-audit.
import { setupTestApp, loginAs, jsonHeaders, ADMIN } from '../../backend/tests/helpers/app';

const MGR = { email: 'manager@hotel.com', password: 'manager123' };
const log = (id: string, o: unknown) => console.log(`POC|${id}|${JSON.stringify(o)}`);

function nights(ci: string, co: string): string[] {
  const out: string[] = [];
  const d = new Date(`${ci}T00:00:00Z`);
  const end = new Date(`${co}T00:00:00Z`);
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function body(ci: string, co: string, room: { id: string; roomNumber: string }, rate = 100000, guest = 'PoC Guest') {
  return {
    guestName: guest,
    source: 'direct',
    checkInDate: ci,
    checkOutDate: co,
    rooms: [{ roomId: room.id, roomNumber: room.roomNumber, roomTypeName: 'X' }],
    pricing: {
      mode: 'same',
      nightlyRates: nights(ci, co).map((date) => ({ date, rate })),
      paymentType: 'no_dp',
      dpType: 'percentage',
    },
  };
}

async function call(ctx: any, method: string, path: string, token?: string, payload?: unknown) {
  const res = await ctx.app.request(
    path,
    { method, headers: jsonHeaders(token), body: payload === undefined ? undefined : JSON.stringify(payload) },
    ctx.env,
  );
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* 204 */
  }
  return { status: res.status, json };
}

/** Adds a per-statement async delay (like a network round trip to D1). Execution stays atomic per statement. */
function withLatency(ctx: any, ms: number) {
  const real = ctx.env.DB;
  const sleep = () => new Promise((r) => setTimeout(r, ms));
  const wrapStmt = (s: any) => ({
    bind: (...p: unknown[]) => wrapStmt(s.bind(...p)),
    all: async () => { await sleep(); return s.all(); },
    first: async (c?: string) => { await sleep(); return s.first(c); },
    run: async () => { await sleep(); return s.run(); },
    raw: async () => { await sleep(); return s.raw(); },
  });
  ctx.env.DB = { ...real, prepare: (sql: string) => wrapStmt(real.prepare(sql)) };
}

describe('verification PoCs (with D1-like latency)', () => {
  it('BE-015b concurrent create same room/dates, 5ms per query', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
    const room = rooms.json.data[0];
    withLatency(ctx, 5);
    const results = await Promise.all([
      call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest A')),
      call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest B')),
    ]);
    const rows = ctx.sqlite
      .prepare(
        "SELECT r.reservation_code, r.guest_name, r.status, rr.room_id FROM reservations r JOIN reservation_rooms rr ON rr.reservation_id=r.id WHERE rr.room_id=? AND r.check_in_date='2027-06-10'",
      )
      .all(room.id);
    log('BE-015b', { statuses: results.map((r) => r.status), rowsForRoom: rows });
  });

  it('BE-015c staggered concurrent creates (offset sweep, 5ms per query)', async () => {
    const outcomes: Record<string, unknown> = {};
    for (const offset of [0, 3, 6, 9, 12, 15, 18, 21, 24, 30]) {
      const ctx = setupTestApp();
      const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
      const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
      const room = rooms.json.data[0];
      withLatency(ctx, 5);
      const p1 = call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest A'));
      await new Promise((r) => setTimeout(r, offset));
      const p2 = call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest B'));
      const [a, b] = await Promise.all([p1, p2]);
      const n = (ctx.sqlite
        .prepare("SELECT count(*) c FROM reservations r JOIN reservation_rooms rr ON rr.reservation_id=r.id WHERE rr.room_id=? AND r.check_in_date='2027-06-10'")
        .get(room.id) as any).c;
      outcomes[`+${offset}ms`] = { statuses: [a.status, b.status], bookingsForSameRoomNights: n };
    }
    log('BE-015c', outcomes);
  });

  it('BE-029 concurrent create different rooms -> same reservation code', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=2', admin);
    withLatency(ctx, 5);
    const results = await Promise.all([
      call(ctx, 'POST', '/api/reservations', admin, body('2027-11-10', '2027-11-12', rooms.json.data[0], 100000, 'Guest One')),
      call(ctx, 'POST', '/api/reservations', admin, body('2027-11-10', '2027-11-12', rooms.json.data[1], 100000, 'Guest Two')),
    ]);
    log('BE-029', { statuses: results.map((r) => r.status), messages: results.map((r) => r.json?.message ?? r.json?.data?.reservationCode) });
  });

  it('BE-018 pay vs cancel race on a Sent invoice', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const inv = await call(ctx, 'POST', '/api/invoices', admin, {
      guestName: 'Race Guest', source: 'direct', invoiceDate: '2027-04-01', items: [{ description: 'r', quantity: 1, unitPrice: 1000000 }],
    });
    await call(ctx, 'POST', `/api/invoices/${inv.json.data.id}/send`, admin);
    withLatency(ctx, 5);
    const [pay, cancel] = await Promise.all([
      call(ctx, 'POST', `/api/invoices/${inv.json.data.id}/pay`, admin),
      call(ctx, 'POST', `/api/invoices/${inv.json.data.id}/cancel`, admin),
    ]);
    const row: any = ctx.sqlite.prepare('SELECT invoice_status s, payment_status p FROM invoices WHERE id=?').get(inv.json.data.id);
    log('BE-018', { pay: pay.status, cancel: cancel.status, finalRow: row });
  });
});

describe('verification PoCs', () => {
  it('BE-001 anonymous register -> operational access', async () => {
    const ctx = setupTestApp();
    const reg = await call(ctx, 'POST', '/api/auth/register', undefined, { name: 'Stranger', email: 'x@evil.test', password: 'abcdef' });
    const token = reg.json.data.token;
    const list = await call(ctx, 'GET', '/api/reservations?page=1&pageSize=5', token);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', token);
    const room = rooms.json.data[0];
    const created = await call(ctx, 'POST', '/api/reservations', token, body('2027-05-01', '2027-05-03', room, 100000, 'Planted by anonymous'));
    log('BE-001', { registerStatus: reg.status, perms: reg.json.data.permissions, listStatus: list.status, listed: list.json.data.length, createStatus: created.status });
    expect(reg.status).toBe(201);
  });

  it('BE-002 manager demotes + deactivates Super Admin', async () => {
    const ctx = setupTestApp();
    const mgr = await loginAs(ctx.app, ctx.env, MGR.email, MGR.password);
    const adminTok = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const demote = await call(ctx, 'PUT', '/api/users/user-001/roles', mgr, { roles: ['role-004'] });
    const me = await call(ctx, 'GET', '/api/auth/me', adminTok);
    const deact = await call(ctx, 'PATCH', '/api/users/user-001/status', mgr, { status: 'inactive' });
    const me2 = await call(ctx, 'GET', '/api/auth/me', adminTok);
    log('BE-002', { demoteStatus: demote.status, adminPermsAfterDemote: me.json?.data?.permissions, deactStatus: deact.status, adminMeAfterDeact: me2.status });
    expect(demote.status).toBe(200);
  });

  it('BE-003 role.create + user.update => escalate without permission.assign', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const ops = await call(ctx, 'POST', '/api/roles', admin, { name: 'Ops Lead', permissions: ['role.create', 'user.update', 'user.view', 'role.view'] });
    await call(ctx, 'PUT', '/api/users/user-003/roles', admin, { roles: [ops.json.data.id] });
    const staff = await loginAs(ctx.app, ctx.env, 'staff@hotel.com', 'staff123');
    const evil = await call(ctx, 'POST', '/api/roles', staff, { name: 'Shadow', permissions: ['user.delete', 'role.delete', 'user.create', 'finance.invoice.delete', 'finance.expense.delete'] });
    const grant = await call(ctx, 'PUT', '/api/users/user-003/roles', staff, { roles: [ops.json.data.id, evil.json.data.id] });
    const me = await call(ctx, 'GET', '/api/auth/me', staff);
    const withAssign = await call(ctx, 'POST', '/api/roles', staff, { name: 'Shadow2', permissions: ['permission.assign'] });
    const grant2 = await call(ctx, 'PUT', '/api/users/user-003/roles', staff, { roles: [withAssign.json?.data?.id] });
    log('BE-003', {
      createRoleStatus: evil.status,
      grantStatus: grant.status,
      perms: me.json.data.permissions,
      createWithPermissionAssign: withAssign.status,
      assignRoleHavingPermissionAssign: grant2.status,
    });
    expect(grant.status).toBe(200);
  });

  it('BE-007 inactive role keeps granting permissions', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const mgr = await loginAs(ctx.app, ctx.env, MGR.email, MGR.password);
    const before = await call(ctx, 'GET', '/api/auth/me', mgr);
    const off = await call(ctx, 'PATCH', '/api/roles/role-002', admin, { status: 'inactive' });
    const after = await call(ctx, 'GET', '/api/auth/me', mgr);
    log('BE-007', { patch: off.status, permsBefore: before.json.data.permissions.length, permsAfter: after.json.data.permissions.length });
    expect(after.json.data.permissions.length).toBe(before.json.data.permissions.length);
  });

  it('BE-015 concurrent create same room/dates', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
    const room = rooms.json.data[0];
    const results = await Promise.all([
      call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest A')),
      call(ctx, 'POST', '/api/reservations', admin, body('2027-06-10', '2027-06-12', room, 100000, 'Guest B')),
    ]);
    const rows = ctx.sqlite
      .prepare(
        "SELECT r.reservation_code, r.guest_name, r.status, rr.room_id FROM reservations r JOIN reservation_rooms rr ON rr.reservation_id=r.id WHERE rr.room_id=? AND r.check_in_date='2027-06-10'",
      )
      .all(room.id);
    log('BE-015', { statuses: results.map((r) => r.status), rowsForRoom: rows });
  });

  it('BE-016 failed edit leaves rates replaced', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
    const room = rooms.json.data[0];
    const x = await call(ctx, 'POST', '/api/reservations', admin, body('2027-07-20', '2027-07-22', room, 100000, 'Blocker'));
    const y = await call(ctx, 'POST', '/api/reservations', admin, body('2027-07-01', '2027-07-03', room, 100000, 'Mover'));
    const before = await call(ctx, 'GET', `/api/reservations/${y.json.data.id}`, admin);
    const edit = await call(ctx, 'PATCH', `/api/reservations/${y.json.data.id}`, admin, {
      checkInDate: '2027-07-20',
      checkOutDate: '2027-07-22',
      rooms: [{ roomId: room.id, roomNumber: room.roomNumber, roomTypeName: 'X' }],
      pricing: body('2027-07-20', '2027-07-22', room, 150000).pricing,
    });
    const after = await call(ctx, 'GET', `/api/reservations/${y.json.data.id}`, admin);
    log('BE-016', {
      blocker: x.status,
      editStatus: edit.status,
      before: { ci: before.json.data.checkInDate, total: before.json.data.totalAmount, nights: before.json.data.calc.nightDates, calcTotal: before.json.data.calc.roomTotal },
      after: { ci: after.json.data.checkInDate, co: after.json.data.checkOutDate, total: after.json.data.totalAmount, nights: after.json.data.calc.nightDates, calcTotal: after.json.data.calc.roomTotal },
    });
  });

  it('BE-017 edit checked-out / cancelled reservation', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const row: any = ctx.sqlite.prepare("SELECT id FROM reservations WHERE status='checked-out' LIMIT 1").get();
    const cx: any = ctx.sqlite.prepare("SELECT id FROM reservations WHERE status='cancelled' LIMIT 1").get();
    const out: any = {};
    for (const [k, r] of [['checkedOut', row], ['cancelled', cx]] as const) {
      if (!r) {
        out[k] = 'no fixture';
        continue;
      }
      const cur = await call(ctx, 'GET', `/api/reservations/${r.id}`, admin);
      const d = cur.json.data;
      const p = await call(ctx, 'PATCH', `/api/reservations/${r.id}`, admin, {
        pricing: {
          mode: 'same',
          paymentType: 'no_dp',
          dpType: 'percentage',
          nightlyRates: d.pricing.nightlyRates.map((n: any) => ({ date: n.date, rate: 1 })),
        },
      });
      out[k] = { patch: p.status, totalBefore: d.totalAmount, totalAfter: p.json?.data?.totalAmount, statusAfter: p.json?.data?.status };
    }
    log('BE-017', out);
  });

  it('BE-019 delete Paid invoice + number reuse', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const inv: any = ctx.sqlite
      .prepare("SELECT id, invoice_number n, invoice_status s, payment_status p, invoice_date d FROM invoices WHERE invoice_status='Completed' ORDER BY invoice_number DESC LIMIT 1")
      .get();
    const maxNum: any = ctx.sqlite
      .prepare('SELECT invoice_number n FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1')
      .get(`${inv.n.slice(0, 9)}%`);
    const toDelete: any = ctx.sqlite
      .prepare('SELECT id, invoice_number n, invoice_status s, payment_status p FROM invoices WHERE invoice_number=?')
      .get(maxNum.n);
    const del = await call(ctx, 'DELETE', `/api/invoices/${toDelete.id}`, admin);
    const created = await call(ctx, 'POST', '/api/invoices', admin, {
      guestName: 'Someone Else',
      source: 'direct',
      invoiceDate: inv.d,
      items: [{ description: 'x', quantity: 1, unitPrice: 1000 }],
    });
    log('BE-019', { deleted: toDelete, deleteStatus: del.status, newNumber: created.json?.data?.invoiceNumber, reusedSameNumber: created.json?.data?.invoiceNumber === toDelete.n });
  });

  it('BE-020/BE-022 create Completed/Paid directly; drafts counted as sales', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const sum0 = await call(ctx, 'GET', '/api/reports/summary?start=2027-01-01&end=2027-12-31', admin);
    const draft = await call(ctx, 'POST', '/api/invoices', admin, {
      guestName: 'Draft Guest',
      source: 'direct',
      invoiceDate: '2027-02-01',
      items: [{ description: 'room', quantity: 1, unitPrice: 5000000 }],
    });
    const sum1 = await call(ctx, 'GET', '/api/reports/summary?start=2027-01-01&end=2027-12-31', admin);
    const direct = await call(ctx, 'POST', '/api/invoices', admin, {
      guestName: 'Direct Paid',
      source: 'direct',
      invoiceDate: '2027-02-02',
      invoiceStatus: 'Completed',
      paymentStatus: 'Paid',
      items: [{ description: 'room', quantity: 1, unitPrice: 1 }],
    });
    const sent = await call(ctx, 'POST', `/api/invoices/${draft.json.data.id}/send`, admin);
    const back = await call(ctx, 'PATCH', `/api/invoices/${draft.json.data.id}`, admin, { invoiceStatus: 'Draft', paymentStatus: 'Paid' });
    log('BE-020/022', {
      draftStatus: draft.json.data.invoiceStatus,
      salesBefore: sum0.json.data.totalSales,
      salesAfterDraft: sum1.json.data.totalSales,
      netAfter: sum1.json.data.netRevenue,
      directCreate: [direct.status, direct.json.data.invoiceStatus, direct.json.data.paymentStatus],
      sentThenPatchBackToDraftPaid: [sent.status, back.status, back.json?.data?.invoiceStatus, back.json?.data?.paymentStatus],
    });
  });

  it('BE-023 role/user changes leave no audit rows', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const count = () => (ctx.sqlite.prepare('SELECT count(*) c FROM activities').get() as any).c;
    const c0 = count();
    await call(ctx, 'PUT', '/api/users/user-003/roles', admin, { roles: ['role-002'] });
    await call(ctx, 'PUT', '/api/roles/role-003/permissions', admin, { permissions: ['user.delete'] });
    await call(ctx, 'POST', '/api/roles', admin, { name: 'Zed', permissions: ['user.delete'] });
    await call(ctx, 'DELETE', '/api/users/user-005', admin);
    const c1 = count();
    log('BE-023', { before: c0, after: c1, rowsAdded: c1 - c0 });
    expect(c1).toBe(c0);
  });

  it('BE-025 impossible date + >60 nights', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
    const room = rooms.json.data[0];
    const bad = body('2027-03-03', '2027-03-05', room);
    const impossible = { ...bad, checkInDate: '2027-02-31' };
    const r1 = await call(ctx, 'POST', '/api/reservations', admin, impossible);
    const long = body('2027-08-01', '2027-10-30', room, 100000, 'Long stay');
    const first60 = { ...long, pricing: { ...long.pricing, nightlyRates: long.pricing.nightlyRates.slice(0, 60) } };
    const r2 = await call(ctx, 'POST', '/api/reservations', admin, first60);
    log('BE-025', {
      impossibleDate: [r1.status, r1.json?.data?.checkInDate, r1.json?.message],
      nightsInRange: nights('2027-08-01', '2027-10-30').length,
      longStay: [r2.status, r2.json?.data?.totalAmount, r2.json?.data?.calc?.nights, r2.json?.message],
    });
  });

  it('BE-024 maintenance room bookable + client room snapshot', async () => {
    const ctx = setupTestApp();
    const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const rooms = await call(ctx, 'GET', '/api/rooms?page=1&pageSize=1', admin);
    const room = rooms.json.data[0];
    await call(ctx, 'PATCH', `/api/rooms/${room.id}/status`, admin, { status: 'maintenance' });
    const r = await call(ctx, 'POST', '/api/reservations', admin, body('2027-09-01', '2027-09-02', { id: room.id, roomNumber: '999' }));
    log('BE-024', { status: r.status, snapshotRoomNumber: r.json?.data?.rooms?.[0]?.roomNumber, realRoomNumber: room.roomNumber });
  });
});
