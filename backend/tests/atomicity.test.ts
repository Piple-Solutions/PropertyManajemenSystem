import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { queryLogFor, setShimLatency } from './helpers/fake-d1';

/**
 * Block 5 regression tests: BE-015 (double booking), BE-016 (failed edit
 * leaves partial writes), BE-018 (non-atomic multi-row writes, state races),
 * BE-029 (reservation-code collision -> 500).
 *
 * Concurrency is emulated with artificial per-statement latency in the D1
 * shim (requests interleave between statements, a batch is atomic), mirroring
 * the audit PoC that reproduced two 201s for the same room and nights.
 */
let ctx: TestContext;
let admin: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

async function call(method: string, path: string, token: string, body?: unknown) {
  const res = await ctx.app.request(
    path,
    { method, headers: jsonHeaders(token), body: body === undefined ? undefined : JSON.stringify(body) },
    ctx.env,
  );
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nights(from: string, count: number, rate = 300000) {
  const out: Array<{ date: string; rate: number }> = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    out.push({ date: d.toISOString().slice(0, 10), rate });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function endDate(from: string, count: number) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
function stay(roomId: string, from = '2027-07-01', count = 2, guest = 'Race Guest', rate = 300000) {
  return {
    guestName: guest,
    source: 'direct',
    checkInDate: from,
    checkOutDate: endDate(from, count),
    notes: '',
    rooms: [{ roomId, roomNumber: 'x', roomTypeName: '' }],
    pricing: { mode: 'same', nightlyRates: nights(from, count, rate), paymentType: 'no_dp', dpType: 'percentage' },
  };
}

const bookingsFor = (roomId: string) =>
  ctx.sqlite
    .prepare(
      "SELECT r.id, r.reservation_code AS code, r.check_in_date AS ci, r.check_out_date AS co FROM reservation_rooms rr JOIN reservations r ON r.id = rr.reservation_id WHERE rr.room_id = ? AND r.status != 'cancelled'",
    )
    .all(roomId) as Array<{ id: string; code: string; ci: string; co: string }>;

const orphanCount = () =>
  (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservation_rooms WHERE reservation_id NOT IN (SELECT id FROM reservations)').get() as { c: number }).c +
  (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservation_nightly_rates WHERE reservation_id NOT IN (SELECT id FROM reservations)').get() as { c: number }).c;

const dbState = (id: string) => ({
  header: ctx.sqlite.prepare('SELECT check_in_date, check_out_date, total_amount, status, guest_name, notes, payment_type, pricing_mode FROM reservations WHERE id = ?').get(id),
  nightly: ctx.sqlite.prepare('SELECT date, rate FROM reservation_nightly_rates WHERE reservation_id = ? ORDER BY date').all(id),
  rooms: ctx.sqlite.prepare('SELECT room_id, room_number, rate, subtotal FROM reservation_rooms WHERE reservation_id = ? ORDER BY room_id').all(id),
});

describe('BE-015: concurrent bookings for the same room and nights', () => {
  it('exactly one 201 for every interleaving offset (PoC offsets 0-30 ms)', async () => {
    setShimLatency(ctx.sqlite, 5);
    const rooms = ['room-01', 'room-02', 'room-03', 'room-04', 'room-05', 'room-06', 'room-07', 'room-08', 'room-09', 'room-10'];
    const offsets = [0, 3, 6, 9, 12, 15, 18, 21, 24, 30];
    for (let i = 0; i < offsets.length; i += 1) {
      const room = rooms[i];
      const first = call('POST', '/api/reservations', staff, stay(room, '2027-07-01', 2, 'Guest A'));
      await sleep(offsets[i]);
      const second = call('POST', '/api/reservations', staff, stay(room, '2027-07-01', 2, 'Guest B'));
      const statuses = [(await first).status, (await second).status].sort();
      expect(statuses, `offset ${offsets[i]}ms`).toEqual([201, 409]);
      expect(bookingsFor(room), `offset ${offsets[i]}ms`).toHaveLength(1);
    }
    expect(orphanCount()).toBe(0);
  });

  it('five simultaneous requests, partially overlapping ranges: one winner, the rest 409 with the existing message', async () => {
    setShimLatency(ctx.sqlite, 4);
    const results = await Promise.all([
      call('POST', '/api/reservations', staff, stay('room-11', '2027-08-01', 3, 'G1')),
      call('POST', '/api/reservations', staff, stay('room-11', '2027-08-02', 3, 'G2')),
      call('POST', '/api/reservations', staff, stay('room-11', '2027-08-03', 1, 'G3')),
      call('POST', '/api/reservations', admin, stay('room-11', '2027-08-01', 1, 'G4')),
      call('POST', '/api/reservations', admin, stay('room-11', '2027-08-02', 2, 'G5')),
    ]);
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok.length + rejected.length).toBe(5);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) expect(r.json.message).toMatch(/Room\(s\) already booked for these dates: room-11/);
    // No two surviving bookings overlap.
    const rows = bookingsFor('room-11');
    expect(rows.length).toBe(ok.length);
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        expect(rows[i].ci < rows[j].co && rows[j].ci < rows[i].co, `${rows[i].code} vs ${rows[j].code}`).toBe(false);
      }
    }
    expect(orphanCount()).toBe(0);
  });

  it('boundary touches and different rooms are still both accepted concurrently', async () => {
    setShimLatency(ctx.sqlite, 4);
    const [a, b, c] = await Promise.all([
      call('POST', '/api/reservations', staff, stay('room-12', '2027-09-01', 2)),
      call('POST', '/api/reservations', staff, stay('room-12', '2027-09-03', 2)),
      call('POST', '/api/reservations', staff, stay('room-13', '2027-09-01', 2)),
    ]);
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
  });

  it('a multi-room booking is all-or-nothing when one of its rooms is taken', async () => {
    expect((await call('POST', '/api/reservations', staff, stay('room-14', '2027-10-01', 2))).status).toBe(201);
    const multi = stay('room-15', '2027-10-01', 2);
    multi.rooms.push({ roomId: 'room-14', roomNumber: 'x', roomTypeName: '' });
    const res = await call('POST', '/api/reservations', staff, multi);
    expect(res.status).toBe(409);
    expect(bookingsFor('room-15')).toHaveLength(0);
    expect(orphanCount()).toBe(0);
  });

  it('a cancelled booking frees the room (overlap predicate unchanged)', async () => {
    const first = await call('POST', '/api/reservations', staff, stay('room-16', '2027-10-10', 2));
    await call('POST', `/api/reservations/${first.json.data.id}/cancel`, admin);
    expect((await call('POST', '/api/reservations', staff, stay('room-16', '2027-10-10', 2))).status).toBe(201);
  });
});

describe('BE-029: reservation-code collisions never surface as 500', () => {
  it('concurrent creates for DIFFERENT rooms all succeed with distinct codes', async () => {
    setShimLatency(ctx.sqlite, 5);
    const rooms = ['room-01', 'room-02', 'room-03', 'room-04', 'room-05', 'room-06'];
    const results = await Promise.all(rooms.map((r) => call('POST', '/api/reservations', staff, stay(r, '2027-11-01', 1))));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    const codes = results.map((r) => r.json.data.reservationCode as string);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^RSV-\d{4}-/);
    expect(orphanCount()).toBe(0);
  });

  it('sequential creates keep the RSV-YYYY-NNN sequence (happy path unchanged)', async () => {
    const a = await call('POST', '/api/reservations', staff, stay('room-01', '2027-11-10', 1));
    const b = await call('POST', '/api/reservations', staff, stay('room-02', '2027-11-10', 1));
    const year = new Date().getFullYear();
    expect(a.json.data.reservationCode).toBe(`RSV-${year}-016`);
    expect(b.json.data.reservationCode).toBe(`RSV-${year}-017`);
  });
});

describe('BE-016: a rejected edit leaves the reservation exactly as it was', () => {
  it('moving onto occupied nights is 409 and header, rates and rooms are untouched (PoC)', async () => {
    const mine = (await call('POST', '/api/reservations', staff, stay('room-01', '2027-07-01', 2, 'Mine', 100000))).json.data;
    expect((await call('POST', '/api/reservations', staff, stay('room-01', '2027-07-20', 3, 'Blocker'))).status).toBe(201);
    const before = dbState(mine.id);
    const res = await call('PATCH', `/api/reservations/${mine.id}`, staff, {
      checkInDate: '2027-07-20',
      checkOutDate: '2027-07-22',
      pricing: { mode: 'same', nightlyRates: nights('2027-07-20', 2, 150000), paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(res.status).toBe(409);
    expect(dbState(mine.id)).toEqual(before);
    const after = (await call('GET', `/api/reservations/${mine.id}`, staff)).json.data;
    expect(after.totalAmount).toBe(200000);
    expect(after.calc.roomTotal).toBe(200000);
    expect(after.pricing.nightlyRates.map((n: any) => n.date)).toEqual(['2027-07-01', '2027-07-02']);
  });

  it('every validation failure after the first check leaves no partial write', async () => {
    const mine = (await call('POST', '/api/reservations', staff, stay('room-02', '2027-07-01', 2, 'Mine'))).json.data;
    const before = dbState(mine.id);
    const attempts: Array<[string, unknown, number]> = [
      ['unknown room with new pricing', { rooms: [{ roomId: 'room-999', roomNumber: 'x' }], pricing: { mode: 'different', nightlyRates: nights('2027-07-01', 2, 1), paymentType: 'no_dp', dpType: 'percentage' } }, 422],
      ['duplicate rooms with new pricing', { rooms: [{ roomId: 'room-03', roomNumber: 'x' }, { roomId: 'room-03', roomNumber: 'x' }], pricing: { mode: 'same', nightlyRates: nights('2027-07-01', 2, 1), paymentType: 'no_dp', dpType: 'percentage' } }, 422],
      ['fixed dp above total', { pricing: { mode: 'same', nightlyRates: nights('2027-07-01', 2, 10), paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 999999 } }, 422],
    ];
    for (const [name, body, status] of attempts) {
      expect((await call('PATCH', `/api/reservations/${mine.id}`, staff, body)).status, name).toBe(status);
      expect(dbState(mine.id), name).toEqual(before);
    }
  });

  it('a storage failure in the middle of an edit rolls the whole edit back', async () => {
    const mine = (await call('POST', '/api/reservations', staff, stay('room-04', '2027-07-01', 2, 'Mine'))).json.data;
    const before = dbState(mine.id);
    // Fail the second new nightly row: with non-atomic writes the header/first row would already be changed.
    ctx.sqlite.exec(
      "CREATE TRIGGER fail_mid_edit BEFORE INSERT ON reservation_nightly_rates WHEN NEW.rate = 777 BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;",
    );
    const res = await call('PATCH', `/api/reservations/${mine.id}`, staff, {
      checkOutDate: '2027-07-04',
      pricing: {
        mode: 'different',
        nightlyRates: [
          { date: '2027-07-01', rate: 111 },
          { date: '2027-07-02', rate: 222 },
          { date: '2027-07-03', rate: 777 },
        ],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    });
    expect(res.status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_mid_edit');
    expect(dbState(mine.id)).toEqual(before);
  });

  it('a storage failure in the middle of a create leaves nothing behind', async () => {
    const count = () => (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservations').get() as { c: number }).c;
    const before = count();
    ctx.sqlite.exec(
      "CREATE TRIGGER fail_mid_create BEFORE INSERT ON reservation_nightly_rates WHEN NEW.rate = 777 BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;",
    );
    const body = stay('room-05', '2027-07-01', 2);
    body.pricing.nightlyRates[1].rate = 777;
    expect((await call('POST', '/api/reservations', staff, body)).status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_mid_create');
    expect(count()).toBe(before);
    expect(orphanCount()).toBe(0);
    expect(bookingsFor('room-05')).toHaveLength(0);
  });

  it('two concurrent edits moving different reservations onto the same room/nights: one wins', async () => {
    const a = (await call('POST', '/api/reservations', staff, stay('room-06', '2027-07-01', 2, 'Guest A'))).json.data;
    const b = (await call('POST', '/api/reservations', staff, stay('room-07', '2027-07-01', 2, 'Guest B'))).json.data;
    setShimLatency(ctx.sqlite, 5);
    const target = { rooms: [{ roomId: 'room-08', roomNumber: 'x' }] };
    const [ra, rb] = await Promise.all([
      call('PATCH', `/api/reservations/${a.id}`, staff, target),
      call('PATCH', `/api/reservations/${b.id}`, staff, target),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect(bookingsFor('room-08')).toHaveLength(1);
    // The loser keeps its original room.
    const loser = ra.status === 409 ? a : b;
    const loserRoom = ra.status === 409 ? 'room-06' : 'room-07';
    expect(bookingsFor(loserRoom).map((r) => r.id)).toEqual([loser.id]);
  });

  it('an edit racing a new booking for the same room/nights: never both', async () => {
    const a = (await call('POST', '/api/reservations', staff, stay('room-09', '2027-07-01', 2, 'Guest A'))).json.data;
    setShimLatency(ctx.sqlite, 5);
    const [edit, create] = await Promise.all([
      call('PATCH', `/api/reservations/${a.id}`, staff, { rooms: [{ roomId: 'room-10', roomNumber: 'x' }] }),
      call('POST', '/api/reservations', staff, stay('room-10', '2027-07-02', 2, 'Guest New')),
    ]);
    expect([edit.status === 200, create.status === 201].filter(Boolean)).toHaveLength(1);
    expect(bookingsFor('room-10')).toHaveLength(1);
  });
});

describe('BE-018: state transitions are conditional (exactly one winner)', () => {
  it('check-in vs cancel on the same reservation: one 200, one 409, consistent final row', async () => {
    const r = (await call('POST', '/api/reservations', staff, stay('room-01', '2027-12-01', 2))).json.data;
    setShimLatency(ctx.sqlite, 5);
    const [ci, cancel] = await Promise.all([
      call('POST', `/api/reservations/${r.id}/check-in`, staff),
      call('POST', `/api/reservations/${r.id}/cancel`, admin),
    ]);
    expect([ci.status, cancel.status].sort()).toEqual([200, 409]);
    const row = ctx.sqlite.prepare('SELECT status, total_amount AS t FROM reservations WHERE id = ?').get(r.id) as { status: string; t: number };
    if (ci.status === 200) expect(row).toEqual({ status: 'checked-in', t: 600000 });
    else expect(row).toEqual({ status: 'cancelled', t: 0 });
  });

  it('double check-in and double check-out: one 200 each', async () => {
    const r = (await call('POST', '/api/reservations', staff, stay('room-02', '2027-12-01', 2))).json.data;
    setShimLatency(ctx.sqlite, 5);
    const ins = await Promise.all([1, 2, 3].map(() => call('POST', `/api/reservations/${r.id}/check-in`, staff)));
    expect(ins.map((x) => x.status).sort()).toEqual([200, 409, 409]);
    const outs = await Promise.all([1, 2, 3].map(() => call('POST', `/api/reservations/${r.id}/check-out`, staff)));
    expect(outs.map((x) => x.status).sort()).toEqual([200, 409, 409]);
  });

  it('an edit racing a cancel can never leave a cancelled reservation with a non-zero total', async () => {
    const r = (await call('POST', '/api/reservations', staff, stay('room-03', '2027-12-01', 2))).json.data;
    setShimLatency(ctx.sqlite, 5);
    const [edit, cancel] = await Promise.all([
      call('PATCH', `/api/reservations/${r.id}`, staff, {
        pricing: { mode: 'same', nightlyRates: nights('2027-12-01', 2, 900000), paymentType: 'no_dp', dpType: 'percentage' },
      }),
      call('POST', `/api/reservations/${r.id}/cancel`, admin),
    ]);
    expect(cancel.status).toBe(200);
    expect([200, 409]).toContain(edit.status);
    const row = ctx.sqlite.prepare('SELECT status, total_amount AS t FROM reservations WHERE id = ?').get(r.id) as { status: string; t: number };
    expect(row).toEqual({ status: 'cancelled', t: 0 });
  });

  it('invoice pay vs cancel: one 200, one 409, never Cancelled + Paid (PoC)', async () => {
    const inv = (await call('POST', '/api/invoices', admin, {
      guestName: 'Race Invoice', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'Room', quantity: 1, unitPrice: 500000 }],
    })).json.data;
    setShimLatency(ctx.sqlite, 5);
    const [pay, cancel] = await Promise.all([
      call('POST', `/api/invoices/${inv.id}/pay`, admin),
      call('POST', `/api/invoices/${inv.id}/cancel`, admin),
    ]);
    expect([pay.status, cancel.status].sort()).toEqual([200, 409]);
    const row = ctx.sqlite.prepare('SELECT invoice_status AS s, payment_status AS p FROM invoices WHERE id = ?').get(inv.id) as { s: string; p: string };
    if (pay.status === 200) expect(row).toEqual({ s: 'Completed', p: 'Paid' });
    else expect(row).toEqual({ s: 'Cancelled', p: 'Pending' });
  });

  it('double pay and double send: one winner each', async () => {
    const inv = (await call('POST', '/api/invoices', admin, {
      guestName: 'Race Invoice', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'Room', quantity: 1, unitPrice: 500000 }],
    })).json.data;
    setShimLatency(ctx.sqlite, 5);
    const sends = await Promise.all([1, 2].map(() => call('POST', `/api/invoices/${inv.id}/send`, admin)));
    expect(sends.map((x) => x.status).sort()).toEqual([200, 409]);
    const pays = await Promise.all([1, 2, 3].map(() => call('POST', `/api/invoices/${inv.id}/pay`, admin)));
    expect(pays.map((x) => x.status).sort()).toEqual([200, 409, 409]);
  });
});

describe('BE-018: multi-row writes are all-or-nothing', () => {
  it('invoice create: a failing item leaves no invoice header', async () => {
    const before = (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoices').get() as { c: number }).c;
    ctx.sqlite.exec("CREATE TRIGGER fail_item BEFORE INSERT ON invoice_items WHEN NEW.description = 'BOOM' BEGIN SELECT RAISE(ABORT, 'simulated'); END;");
    const res = await call('POST', '/api/invoices', admin, {
      guestName: 'Atomic Invoice', source: 'direct', invoiceDate: '2026-09-18',
      items: [{ description: 'ok', quantity: 1, unitPrice: 1 }, { description: 'BOOM', quantity: 1, unitPrice: 1 }],
    });
    expect(res.status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_item');
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoices').get() as { c: number }).c).toBe(before);
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)').get() as { c: number }).c).toBe(0);
  });

  it('invoice update: a failing item keeps the old items and totals', async () => {
    const inv = (await call('POST', '/api/invoices', admin, {
      guestName: 'Atomic Invoice', source: 'direct', invoiceDate: '2026-09-18', items: [{ description: 'old', quantity: 2, unitPrice: 1000 }],
    })).json.data;
    ctx.sqlite.exec("CREATE TRIGGER fail_item BEFORE INSERT ON invoice_items WHEN NEW.description = 'BOOM' BEGIN SELECT RAISE(ABORT, 'simulated'); END;");
    const res = await call('PATCH', `/api/invoices/${inv.id}`, admin, { items: [{ description: 'new', quantity: 1, unitPrice: 5 }, { description: 'BOOM', quantity: 1, unitPrice: 5 }] });
    expect(res.status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_item');
    const after = (await call('GET', `/api/invoices/${inv.id}`, admin)).json.data;
    expect(after.total).toBe(2000);
    expect(after.items.map((i: any) => i.description)).toEqual(['old']);
  });

  it('user role replacement: a failing insert keeps the previous roles (no role-less user)', async () => {
    ctx.sqlite.exec("CREATE TRIGGER fail_role BEFORE INSERT ON user_roles WHEN NEW.role_id = 'role-005' BEGIN SELECT RAISE(ABORT, 'simulated'); END;");
    const res = await call('PUT', '/api/users/user-005/roles', admin, { roles: ['role-005'] });
    expect(res.status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_role');
    const roles = (ctx.sqlite.prepare("SELECT role_id AS r FROM user_roles WHERE user_id = 'user-005'").all() as Array<{ r: string }>).map((x) => x.r);
    expect(roles).toEqual(['role-003']);
  });

  it('role permission replacement: a failing insert keeps the previous permissions', async () => {
    const before = (ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = 'role-005'").get() as { c: number }).c;
    ctx.sqlite.exec("CREATE TRIGGER fail_perm BEFORE INSERT ON role_permissions WHEN NEW.role_id = 'role-005' BEGIN SELECT RAISE(ABORT, 'simulated'); END;");
    const res = await call('PUT', '/api/roles/role-005/permissions', admin, { permissions: ['room.view'] });
    expect(res.status).toBe(500);
    ctx.sqlite.exec('DROP TRIGGER fail_perm');
    expect((ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = 'role-005'").get() as { c: number }).c).toBe(before);
  });
});

describe('Block 5 statement budgets (create/edit must not exceed the Block 4 numbers)', () => {
  it('create and edit stay at or below their previous cost', async () => {
    const log = queryLogFor(ctx.sqlite);
    const measure = async (method: string, path: string, body?: unknown) => {
      log.reset();
      const r = await call(method, path, staff, body);
      return { n: log.count, json: r.json, status: r.status };
    };
    const one = await measure('POST', '/api/reservations', stay('room-15', '2026-12-20', 2));
    expect(one.status).toBe(201);
    const two = stay('room-16', '2026-12-25', 2);
    two.rooms.push({ roomId: 'room-17', roomNumber: 'x', roomTypeName: '' });
    const id = one.json.data.id as string;
    const costs = {
      create1room: one.n,
      create2rooms: (await measure('POST', '/api/reservations', two)).n,
      patchNotes: (await measure('PATCH', `/api/reservations/${id}`, { notes: 'x' })).n,
      patchFull: (await measure('PATCH', `/api/reservations/${id}`, stay('room-15', '2026-12-20', 2))).n,
      patchRoom: (await measure('PATCH', `/api/reservations/${id}`, { rooms: [{ roomId: 'room-18', roomNumber: 'x' }] })).n,
    };
    const block4 = { create1room: 19, create2rooms: 20, patchNotes: 14, patchFull: 23, patchRoom: 19 };
    // Measured after Block 5: 15 / 15 / 13 / 18 / 16.
    const block5 = { create1room: 15, create2rooms: 15, patchNotes: 13, patchFull: 18, patchRoom: 16 };
    for (const k of Object.keys(block5) as Array<keyof typeof block5>) expect(costs[k], `${k} (block 5 budget)`).toBeLessThanOrEqual(block5[k]);
    for (const k of Object.keys(block4) as Array<keyof typeof block4>) {
      expect(costs[k], k).toBeLessThanOrEqual(block4[k]);
    }
  });
});
