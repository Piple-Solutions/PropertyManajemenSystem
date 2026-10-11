import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

/**
 * Block 4 regression tests: BE-017 (status guard), BE-024 (room must be
 * active, server-side snapshot), BE-025 (real calendar dates, stay limit).
 * Derived from the audit PoCs and `.tmp-fix/contract.md` section 4 (the
 * wizard PATCHes the FULL payload for every status).
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

function stay(over: Record<string, unknown> = {}, from = '2026-12-01', count = 2) {
  return {
    guestName: 'Guard Guest',
    source: 'direct',
    checkInDate: from,
    checkOutDate: endDate(from, count),
    notes: '',
    rooms: [{ roomId: 'room-10', roomNumber: '10', roomTypeName: 'Twin' }],
    pricing: { mode: 'same', nightlyRates: nights(from, count), paymentType: 'no_dp', dpType: 'percentage' },
    ...over,
  };
}

/** The payload the wizard sends when only a field such as notes changed. */
function wizardPayload(full: any, over: Record<string, unknown> = {}) {
  return {
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
    ...over,
  };
}

async function created(over: Record<string, unknown> = {}, from = '2026-12-01', count = 2) {
  const res = await call('POST', '/api/reservations', staff, stay(over, from, count));
  expect(res.status).toBe(201);
  return res.json.data as any;
}

const dbState = (id: string) => ({
  header: ctx.sqlite.prepare('SELECT check_in_date, check_out_date, total_amount, status, guest_name, notes, payment_type FROM reservations WHERE id = ?').get(id),
  nightly: ctx.sqlite.prepare('SELECT date, rate FROM reservation_nightly_rates WHERE reservation_id = ? ORDER BY date').all(id),
  rooms: ctx.sqlite.prepare('SELECT room_id, room_number, room_type_name, rate, subtotal FROM reservation_rooms WHERE reservation_id = ? ORDER BY room_id').all(id),
});

describe('BE-017: terminal reservations cannot be re-priced, re-dated or moved', () => {
  async function checkedOut() {
    const r = await created();
    await call('POST', `/api/reservations/${r.id}/check-in`, staff);
    await call('POST', `/api/reservations/${r.id}/check-out`, staff);
    return r.id as string;
  }
  async function cancelled() {
    const r = await created({ rooms: [{ roomId: 'room-11', roomNumber: '11', roomTypeName: 'Twin' }] }, '2026-12-10');
    await call('POST', `/api/reservations/${r.id}/cancel`, admin);
    return r.id as string;
  }

  it('re-pricing, re-dating or re-rooming a checked-out reservation is 409 and leaves every row untouched', async () => {
    const id = await checkedOut();
    const before = dbState(id);
    const attempts: Array<[string, unknown]> = [
      ['pricing', { pricing: { mode: 'same', nightlyRates: nights('2026-12-01', 2, 1), paymentType: 'no_dp', dpType: 'percentage' } }],
      ['dates', { checkInDate: '2026-12-02', checkOutDate: '2026-12-04', pricing: { mode: 'same', nightlyRates: nights('2026-12-02', 2), paymentType: 'no_dp', dpType: 'percentage' } }],
      ['rooms', { rooms: [{ roomId: 'room-12', roomNumber: '12', roomTypeName: 'Twin' }] }],
      ['payment terms', { pricing: { mode: 'same', nightlyRates: nights('2026-12-01', 2), paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 100000 } }],
    ];
    for (const [name, body] of attempts) {
      const res = await call('PATCH', `/api/reservations/${id}`, staff, body);
      expect(res.status, name).toBe(409);
      expect(res.json.message, name).toMatch(/tidak dapat diubah/);
    }
    expect(dbState(id)).toEqual(before);
  });

  it('a cancelled reservation keeps total 0 and its rates (PoC: 0 -> 2)', async () => {
    const id = await cancelled();
    const before = dbState(id);
    expect(before.header).toMatchObject({ total_amount: 0, status: 'cancelled' });
    const res = await call('PATCH', `/api/reservations/${id}`, staff, {
      pricing: { mode: 'same', nightlyRates: nights('2026-12-10', 2, 1), paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(res.status).toBe(409);
    expect(dbState(id)).toEqual(before);
  });

  it('what the wizard legitimately saves still works: unchanged full payload + guest/source/notes on checked-out and cancelled', async () => {
    for (const make of [checkedOut, cancelled]) {
      const id = await make();
      const before = dbState(id);
      const full = (await call('GET', `/api/reservations/${id}`, staff)).json.data;
      const res = await call('PATCH', `/api/reservations/${id}`, staff, wizardPayload(full, { guestName: 'Renamed Guest', notes: 'late note', source: 'phone' }));
      expect(res.status).toBe(200);
      expect(res.json.data.guestName).toBe('Renamed Guest');
      expect(res.json.data.notes).toBe('late note');
      expect(res.json.data.source).toBe('phone');
      // Money, dates and rooms are byte-for-byte what they were (cancelled stays at 0).
      const after = dbState(id);
      expect(after.nightly).toEqual(before.nightly);
      expect(after.rooms).toEqual(before.rooms);
      expect(after.header).toMatchObject({
        check_in_date: (before.header as any).check_in_date,
        check_out_date: (before.header as any).check_out_date,
        total_amount: (before.header as any).total_amount,
        status: (before.header as any).status,
      });
    }
  });

  it('DP terms sent as the wizard builds them (no_dp + percentage value) count as unchanged', async () => {
    const id = await checkedOut();
    const full = (await call('GET', `/api/reservations/${id}`, staff)).json.data;
    const payload = wizardPayload(full);
    payload.pricing = { ...payload.pricing, paymentType: 'no_dp', dpType: 'percentage', dpPercentage: 30 };
    expect((await call('PATCH', `/api/reservations/${id}`, staff, payload)).status).toBe(200);
  });

  it('a checked-in stay can still be extended or re-priced (legitimate front-desk operation, decision D-021)', async () => {
    const r = await created();
    await call('POST', `/api/reservations/${r.id}/check-in`, staff);
    const res = await call('PATCH', `/api/reservations/${r.id}`, staff, {
      checkOutDate: '2026-12-04',
      pricing: { mode: 'same', nightlyRates: nights('2026-12-01', 3), paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.totalAmount).toBe(900000);
  });

  it('reserved reservations are unaffected', async () => {
    const r = await created();
    const res = await call('PATCH', `/api/reservations/${r.id}`, staff, {
      pricing: { mode: 'same', nightlyRates: nights('2026-12-01', 2, 400000), paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.totalAmount).toBe(800000);
  });
});

describe('BE-024: rooms must be active; the snapshot comes from the server', () => {
  it('a maintenance or inactive room cannot be booked (422) and nothing is written', async () => {
    await call('PATCH', '/api/rooms/room-10', admin, { status: 'maintenance' });
    await call('PATCH', '/api/rooms/room-11', admin, { status: 'inactive' });
    const before = (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservations').get() as { c: number }).c;
    for (const roomId of ['room-10', 'room-11']) {
      const res = await call('POST', '/api/reservations', staff, stay({ rooms: [{ roomId, roomNumber: '999', roomTypeName: 'X' }] }));
      expect(res.status, roomId).toBe(422);
      expect(JSON.stringify(res.json.errors)).toMatch(/tidak aktif/);
    }
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM reservations').get() as { c: number }).c).toBe(before);
  });

  it('roomNumber and roomTypeName are taken from rooms/room_types, not from the request (PoC: "999")', async () => {
    const res = await call('POST', '/api/reservations', staff, stay({ rooms: [{ roomId: 'room-10', roomNumber: '999', roomTypeName: 'Penthouse' }] }));
    expect(res.status).toBe(201);
    expect(res.json.data.rooms[0]).toMatchObject({ roomId: 'room-10', roomNumber: '10', roomTypeName: 'Twin' });
  });

  it('adding a non-active room on edit is 422; keeping an already-booked room that later went to maintenance is not', async () => {
    const r = await created();
    await call('PATCH', '/api/rooms/room-10', admin, { status: 'maintenance' }); // the booked room itself
    await call('PATCH', '/api/rooms/room-12', admin, { status: 'maintenance' });
    const full = (await call('GET', `/api/reservations/${r.id}`, staff)).json.data;

    // Wizard saves a note: full payload, same room, same dates -> still fine.
    const note = await call('PATCH', `/api/reservations/${r.id}`, staff, wizardPayload(full, { notes: 'still ok' }));
    expect(note.status).toBe(200);

    const add = await call('PATCH', `/api/reservations/${r.id}`, staff, {
      rooms: [
        { roomId: 'room-10', roomNumber: '10', roomTypeName: 'Twin' },
        { roomId: 'room-12', roomNumber: '12', roomTypeName: 'Twin' },
      ],
    });
    expect(add.status).toBe(422);

    // Moving the dates of a booking whose room is out of order is a room/date change: refused.
    const move = await call('PATCH', `/api/reservations/${r.id}`, staff, {
      checkInDate: '2026-12-05',
      checkOutDate: '2026-12-07',
      pricing: { mode: 'same', nightlyRates: nights('2026-12-05', 2), paymentType: 'no_dp', dpType: 'percentage' },
    });
    expect(move.status).toBe(422);
  });

  it('existing snapshots survive edits (a renamed room does not rewrite history) and new rooms get the server value', async () => {
    const r = await created();
    await call('PATCH', '/api/rooms/room-10', admin, { roomNumber: '10-RENAMED' });
    const full = (await call('GET', `/api/reservations/${r.id}`, staff)).json.data;
    const res = await call('PATCH', `/api/reservations/${r.id}`, staff, wizardPayload(full, {
      rooms: [
        { roomId: 'room-10', roomNumber: '10-RENAMED', roomTypeName: 'Twin' },
        { roomId: 'room-13', roomNumber: 'typed-by-client', roomTypeName: 'Nope' },
      ],
    }));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.json.data.rooms.map((x: any) => [x.roomId, x]));
    expect(byId['room-10'].roomNumber).toBe('10'); // booking-time snapshot kept
    expect(byId['room-13'].roomNumber).toBe('13');
    expect(byId['room-13'].roomTypeName).toBe('Standard');
  });
});

describe('BE-025: real calendar dates and the 60-night limit', () => {
  it('impossible dates are rejected with 422 on create, update, availability and calendar', async () => {
    const bad = stay({
      checkInDate: '2027-02-31',
      checkOutDate: '2027-03-05',
      pricing: { mode: 'same', nightlyRates: nights('2027-03-03', 2), paymentType: 'no_dp', dpType: 'percentage' },
    });
    const c = await call('POST', '/api/reservations', staff, bad);
    expect(c.status).toBe(422);
    expect(c.json.errors.checkInDate).toBeDefined();
    const r = await created();
    expect((await call('PATCH', `/api/reservations/${r.id}`, staff, { checkInDate: '2027-02-30', checkOutDate: '2027-03-05' })).status).toBe(422);
    expect((await call('GET', '/api/reservations/availability?checkIn=2027-02-31&checkOut=2027-03-05', staff)).status).toBe(422);
    expect((await call('GET', '/api/reservations/calendar?from=2027-04-31&to=2027-05-05', staff)).status).toBe(422);
    expect((ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM reservations WHERE check_in_date = '2027-02-31'").get() as { c: number }).c).toBe(0);
  });

  it('leap days are honoured (2028-02-29 ok, 2027-02-29 rejected)', async () => {
    const ok = await call('POST', '/api/reservations', staff, stay({}, '2028-02-29', 1));
    expect(ok.status).toBe(201);
    const bad = await call('POST', '/api/reservations', staff, stay({}, '2027-02-29', 1));
    expect(bad.status).toBe(422);
  });

  it('a stay of exactly 60 nights is accepted and priced in full', async () => {
    const res = await call('POST', '/api/reservations', staff, stay({}, '2027-01-01', 60));
    expect(res.status).toBe(201);
    expect(res.json.data.calc.nights).toBe(60);
    expect(res.json.data.totalAmount).toBe(60 * 300000);
  });

  it('a stay over 60 nights is rejected (422), never silently truncated (PoC: 90 nights priced as 60)', async () => {
    const res = await call('POST', '/api/reservations', staff, stay({
      checkInDate: '2027-01-01',
      checkOutDate: '2027-04-01',
      pricing: { mode: 'same', nightlyRates: nights('2027-01-01', 60), paymentType: 'no_dp', dpType: 'percentage' },
    }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.json.errors)).toMatch(/60 malam/);
    expect((ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM reservations WHERE check_in_date = '2027-01-01'").get() as { c: number }).c).toBe(0);
  });

  it('extending an existing reservation beyond 60 nights is rejected and leaves it untouched', async () => {
    const r = await created({}, '2027-01-01', 59);
    const before = dbState(r.id);
    const res = await call('PATCH', `/api/reservations/${r.id}`, staff, { checkOutDate: '2027-04-01' });
    expect(res.status).toBe(422);
    expect(dbState(r.id)).toEqual(before);
  });

  it('stored legacy rows are not revalidated: a notes-only edit of a seeded reservation still works', async () => {
    const res = await call('PATCH', '/api/reservations/res-001', staff, { notes: 'legacy ok' });
    expect(res.status).toBe(200);
  });
});
