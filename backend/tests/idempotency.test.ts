import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { setShimLatency } from './helpers/fake-d1';
import { createD1Db } from '../src/db/client';
import { expenses, idempotencyKeys } from '../src/db/schema';
import { runAtomic } from '../src/lib/atomic';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  fingerprintBody,
  idempotencyPivot,
  idempotencyTripwire,
  isIdempotencyLostRace,
  purgeExpiredIdempotencyKeys,
  withIdempotency,
  type IdempotencyExecution,
} from '../src/lib/idempotency';
import { createExpense, type CreateExpenseInput } from '../src/services/expenseService';
import type { AppEnv } from '../src/env';

/**
 * Approved idempotency design (migration 0007 + lib/idempotency.ts): an
 * optional Idempotency-Key on the three create endpoints. Deterministic crash
 * simulation is done via row surgery on the test sqlite (real D1 faults are
 * not reproducible); fixtures are seeded by setupTestApp, so entity counts
 * are asserted RELATIVE to captured baselines.
 */
let ctx: TestContext;
let admin: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

async function call(method: string, path: string, token: string, body?: unknown, key?: string) {
  const headers: Record<string, string> = { ...jsonHeaders(token) };
  if (key) headers[IDEMPOTENCY_KEY_HEADER] = key;
  const res = await ctx.app.request(
    path,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    ctx.env,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? (JSON.parse(text) as any) : null };
}

const countOf = (table: string) =>
  (ctx.sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
const count = {
  expenses: () => countOf('expenses'),
  reservations: () => countOf('reservations'),
  invoices: () => countOf('invoices'),
  idempotency: () => countOf('idempotency_keys'),
  activities: (action: string) =>
    (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM activities WHERE action = ?').get(action) as { c: number }).c,
};

type IdemRow = {
  status: string;
  request_hash: string;
  result_code: number | null;
  entity_id: string | null;
  response_body: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};
const rowFor = (endpoint: string, key: string): IdemRow | undefined =>
  ctx.sqlite
    .prepare('SELECT * FROM idempotency_keys WHERE endpoint = ? AND key = ?')
    .get(endpoint, key) as IdemRow | undefined;

const EXPENSE_BODY: CreateExpenseInput = {
  date: '2027-10-01',
  category: 'Supplies',
  description: 'Idem expenses test',
  amount: 125000,
  status: 'Paid',
};

const INVOICE_BODY = {
  guestName: 'Idem Invoice Guest',
  source: 'direct',
  invoiceDate: '2027-10-01',
  items: [{ description: 'Room charge', quantity: 2, unitPrice: 300000 }],
};

function stay(roomId: string, from = '2027-12-01', count = 2, guest = 'Idem Guest', rate = 300000) {
  const nights: Array<{ date: string; rate: number }> = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    nights.push({ date: d.toISOString().slice(0, 10), rate });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return {
    guestName: guest,
    source: 'direct',
    checkInDate: from,
    checkOutDate: d.toISOString().slice(0, 10),
    notes: '',
    rooms: [{ roomId, roomNumber: 'x', roomTypeName: '' }],
    pricing: { mode: 'same', nightlyRates: nights, paymentType: 'no_dp', dpType: 'percentage' },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALE_AT = new Date(Date.now() - 91 * 1000).toISOString();

/* ------------------------------------------------------------------ */

describe('legacy behavior without the header', () => {
  it('creates normally and touches no idempotency rows', async () => {
    const entitiesBefore = count.expenses();
    const keysBefore = count.idempotency();
    const res = await call('POST', '/api/expenses', admin, EXPENSE_BODY);
    expect(res.status).toBe(201);
    expect(res.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(count.expenses()).toBe(entitiesBefore + 1);
    expect(count.idempotency()).toBe(keysBefore);
  });

  it('reservation and invoice creates stay legacy when unkeyed', async () => {
    expect((await call('POST', '/api/reservations', staff, stay('room-01'))).status).toBe(201);
    expect((await call('POST', '/api/invoices', admin, INVOICE_BODY)).status).toBe(201);
    expect(count.idempotency()).toBe(0);
  });
});

describe('key contract', () => {
  it('rejects malformed keys with 400 and creates nothing', async () => {
    const entitiesBefore = count.expenses();
    for (const bad of ['short', 'has spaces!', `${'x'.repeat(101)}`]) {
      const res = await call('POST', '/api/expenses', admin, EXPENSE_BODY, bad);
      expect(res.status).toBe(400);
      expect(res.json.message).toMatch(/Idempotency-Key/);
    }
    expect(count.expenses()).toBe(entitiesBefore);
    expect(count.idempotency()).toBe(0);
  });

  it('executes once, then replays status + body with the diagnostic header', async () => {
    const entitiesBefore = count.expenses();
    const first = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-expense-0001');
    expect(first.status).toBe(201);
    expect(first.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(count.expenses()).toBe(entitiesBefore + 1);

    const row = rowFor('POST /api/expenses', 'idem-expense-0001');
    expect(row?.status).toBe('completed');
    expect(row?.result_code).toBe(201);
    expect(row?.entity_id).toBe(first.json.data.id);
    expect(row?.response_body).toContain(first.json.data.id as string);
    // Retention is 48h from the claim instant (expires_at uses Date.now(),
    // updated_at an ISO stamp taken in the same instant — tolerate clock skew).
    const delta = new Date(row!.expires_at).getTime() - new Date(row!.updated_at).getTime();
    expect(delta).toBeGreaterThanOrEqual(48 * 60 * 60 * 1000 - 5000);
    expect(delta).toBeLessThanOrEqual(48 * 60 * 60 * 1000);

    const second = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-expense-0001');
    expect(second.status).toBe(first.status);
    expect(second.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(second.json).toEqual(first.json);
    expect(count.expenses()).toBe(entitiesBefore + 1);
  });

  it('canonicalizes property order: reordered JSON replays instead of duplicating', async () => {
    const entitiesBefore = count.expenses();
    const first = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-order-0001');
    expect(first.status).toBe(201);
    const reordered = {
      status: 'Paid',
      amount: 125000,
      description: 'Idem expenses test',
      category: 'Supplies',
      date: '2027-10-01',
    };
    const second = await call('POST', '/api/expenses', admin, reordered, 'idem-order-0001');
    expect(second.status).toBe(201);
    expect(second.json.data.id).toBe(first.json.data.id);
    expect(count.expenses()).toBe(entitiesBefore + 1);
  });

  it('rejects the same key with a different payload (422)', async () => {
    const entitiesBefore = count.expenses();
    const first = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-mismatch-01');
    expect(first.status).toBe(201);
    const second = await call(
      'POST',
      '/api/expenses',
      admin,
      { ...EXPENSE_BODY, description: 'A different submission' },
      'idem-mismatch-01',
    );
    expect(second.status).toBe(422);
    expect(second.json.message).toMatch(/different request payload/);
    expect(count.expenses()).toBe(entitiesBefore + 1);
  });

  it('in-flight duplicate gets 409 + Retry-After, not a double execution', async () => {
    // Deterministic overlap: plant a fresh claim artifact for the exact
    // payload, then send the same request — the wrapper must 409 with
    // Retry-After without executing the batch.
    setShimLatency(ctx.sqlite, 25);
    const manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
    const managerId = (ctx.sqlite.prepare('SELECT id FROM users WHERE email = ?').get('manager@hotel.com') as { id: string }).id;
    const hash = await fingerprintBody(EXPENSE_BODY);
    const entitiesBefore = count.expenses();
    ctx.sqlite
      .prepare(
        `INSERT INTO idempotency_keys (user_id, endpoint, key, request_hash, status, created_at, updated_at, expires_at)
         VALUES (?, 'POST /api/expenses', 'idem-inflight-01', ?, 'in_progress', ?, ?, ?)`,
      )
      .run(
        managerId,
        hash,
        new Date().toISOString(),
        new Date().toISOString(),
        new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      );

    const second = await call('POST', '/api/expenses', manager, EXPENSE_BODY, 'idem-inflight-01');
    expect(second.status).toBe(409);
    expect(second.headers.get('Retry-After')).toBe('2');
    expect(second.json.message).toMatch(/still processing/i);
    expect(count.expenses()).toBe(entitiesBefore);

    // The artifact clearing (owner request finishes/crashes) unblocks a retry.
    ctx.sqlite
      .prepare("DELETE FROM idempotency_keys WHERE endpoint = 'POST /api/expenses' AND key = 'idem-inflight-01'")
      .run();
    const fresh = await call('POST', '/api/expenses', manager, EXPENSE_BODY, 'idem-inflight-01');
    expect(fresh.status).toBe(201);
    expect(count.expenses()).toBe(entitiesBefore + 1);
    expect(rowFor('POST /api/expenses', 'idem-inflight-01')?.entity_id).toBe(fresh.json.data.id);
  });

  it('is scoped per user: another user with the same key executes independently', async () => {
    // Manager shares finance.expense.create but is a distinct row owner.
    const manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
    const entitiesBefore = count.expenses();
    const adminRes = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-scope-0001');
    expect(adminRes.status).toBe(201);
    const otherRes = await call('POST', '/api/expenses', manager, EXPENSE_BODY, 'idem-scope-0001');
    // No cross-user replay: the manager's own execution, own row, own entity.
    expect(otherRes.status).toBe(201);
    expect(otherRes.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBeNull();
    expect(otherRes.json.data.id).not.toBe(adminRes.json.data.id);
    expect(count.expenses()).toBe(entitiesBefore + 2);
    const rows = ctx.sqlite
      .prepare('SELECT user_id, status FROM idempotency_keys WHERE endpoint = ? AND key = ?')
      .all('POST /api/expenses', 'idem-scope-0001') as Array<{ user_id: string; status: string }>;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['completed']));
  });
});

describe('all three endpoints replay their own shapes', () => {
  it('invoice: replay keeps the original invoice number, no new entity', async () => {
    const before = count.invoices();
    const activitiesBefore = count.activities('invoice_create');
    const first = await call('POST', '/api/invoices', admin, INVOICE_BODY, 'idem-invoice-0001');
    expect(first.status).toBe(201);
    const second = await call('POST', '/api/invoices', admin, INVOICE_BODY, 'idem-invoice-0001');
    expect(second.status).toBe(201);
    expect(second.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(second.json).toEqual(first.json);
    expect(second.json.data.invoiceNumber).toBe(first.json.data.invoiceNumber);
    expect(count.invoices()).toBe(before + 1);
    expect(count.activities('invoice_create')).toBe(activitiesBefore + 1);
  });

  it('invoice: same key + different payload gets 422 and creates nothing new', async () => {
    const before = count.invoices();
    const first = await call('POST', '/api/invoices', admin, INVOICE_BODY, 'idem-invoice-0002');
    expect(first.status).toBe(201);
    const second = await call(
      'POST',
      '/api/invoices',
      admin,
      { ...INVOICE_BODY, guestName: 'Someone Else' },
      'idem-invoice-0002',
    );
    expect(second.status).toBe(422);
    expect(count.invoices()).toBe(before + 1);
  });

  it('reservation: replay keeps the original reservation code, no new entity', async () => {
    setShimLatency(ctx.sqlite, 2);
    const before = count.reservations();
    const activitiesBefore = count.activities('create');
    const first = await call('POST', '/api/reservations', staff, stay('room-01'), 'idem-resv-00001');
    expect(first.status).toBe(201);
    const second = await call('POST', '/api/reservations', staff, stay('room-01'), 'idem-resv-00001');
    expect(second.status).toBe(201);
    expect(second.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(second.json).toEqual(first.json);
    expect(second.json.data.reservationCode).toBe(first.json.data.reservationCode);
    expect(count.reservations()).toBe(before + 1);
    expect(count.activities('create')).toBe(activitiesBefore + 1);
  });
});

describe('deterministic business conflicts are recorded, never faked success', () => {
  it('overlap 409 is stored and replayed verbatim; no reservation row exists', async () => {
    setShimLatency(ctx.sqlite, 2);
    const before = count.reservations();
    const blocker = stay('room-02', '2027-11-01', 2, 'Blocker');
    expect((await call('POST', '/api/reservations', staff, blocker)).status).toBe(201);

    const clash = stay('room-02', '2027-11-01', 2, 'Clash A');
    const first = await call('POST', '/api/reservations', staff, clash, 'idem-conflict-01');
    expect(first.status).toBe(409);

    const row = rowFor('POST /api/reservations', 'idem-conflict-01');
    expect(row?.status).toBe('failed');
    expect(row?.result_code).toBe(409);
    expect(row?.response_body).toMatch(/already booked/i);
    expect(row?.entity_id).toBeNull();

    const replay = await call('POST', '/api/reservations', staff, clash, 'idem-conflict-01');
    expect(replay.status).toBe(409);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(replay.json).toEqual(first.json);
    expect(count.reservations()).toBe(before + 1);
  });
});

describe('concurrency: one key, one entity', () => {
  it('8 simultaneous identical requests create exactly one expense', async () => {
    setShimLatency(ctx.sqlite, 15);
    const before = count.expenses();
    const activitiesBefore = count.activities('expense_create');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-race-expense')),
    );
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.headers.get('Retry-After')).toBe('2');
    }
    const ok = results.filter((x) => x.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.json.data.id)).size).toBe(1);
    expect(count.expenses()).toBe(before + 1);
    expect(count.activities('expense_create')).toBe(activitiesBefore + 1);
  });

  it('8 simultaneous identical requests create exactly one reservation', async () => {
    setShimLatency(ctx.sqlite, 12);
    const before = count.reservations();
    const body = stay('room-03', '2027-12-05', 2);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => call('POST', '/api/reservations', staff, body, 'idem-race-resv')),
    );
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    const ok = results.filter((x) => x.status === 201);
    expect(new Set(ok.map((r) => r.json.data.id)).size).toBe(1);
    expect(count.reservations()).toBe(before + 1);
    const orphans = countOf(
      'reservation_rooms WHERE reservation_id NOT IN (SELECT id FROM reservations)',
    );
    expect(orphans).toBe(0);
  });
});

describe('crash recovery and reclaim (row surgery)', () => {
  it('body lost after commit: retry rebuilds the response from entity_id', async () => {
    const before = count.expenses();
    const first = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-crash-body');
    expect(first.status).toBe(201);
    // Simulate the crash window: business batch committed, response not stored.
    ctx.sqlite
      .prepare("UPDATE idempotency_keys SET response_body = NULL WHERE endpoint = 'POST /api/expenses' AND key = 'idem-crash-body'")
      .run();
    const replay = await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-crash-body');
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe('true');
    expect(replay.json).toEqual(first.json);
    expect(count.expenses()).toBe(before + 1);
    expect(rowFor('POST /api/expenses', 'idem-crash-body')?.response_body).toContain(first.json.data.id);
  });

  it('stale in_progress claim is reclaimed by the same payload; fresh one still 409s', async () => {
    const before = count.reservations();
    const body = stay('room-04', '2027-12-10', 2);
    const staffId = STAFF_USER_ID();
    const hash = await fingerprintBody(body);
    ctx.sqlite
      .prepare(
        `INSERT INTO idempotency_keys (user_id, endpoint, key, request_hash, status, created_at, updated_at, expires_at)
         VALUES (?, 'POST /api/reservations', 'idem-stale-resv', ?, 'in_progress', ?, ?, ?)`,
      )
      .run(
        staffId,
        hash,
        new Date().toISOString(),
        new Date(Date.now() - 1000).toISOString(),
        new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      );
    // Fresh artifact (within the claim bound): in-flight 409, no execution.
    const inflight = await call('POST', '/api/reservations', staff, body, 'idem-stale-resv');
    expect(inflight.status).toBe(409);
    expect(count.reservations()).toBe(before);

    // Aged past the claim bound: reclaim + execute exactly once.
    ctx.sqlite
      .prepare("UPDATE idempotency_keys SET updated_at = ? WHERE endpoint = 'POST /api/reservations' AND key = 'idem-stale-resv'")
      .run(STALE_AT);
    const reclaimed = await call('POST', '/api/reservations', staff, body, 'idem-stale-resv');
    expect(reclaimed.status).toBe(201);
    expect(count.reservations()).toBe(before + 1);
    const row = rowFor('POST /api/reservations', 'idem-stale-resv');
    expect(row?.status).toBe('completed');
    expect(row?.entity_id).toBe(reclaimed.json.data.id);
  });

  it('expired rows are purged but unexpired ones survive (48h retention)', async () => {
    const db = createD1Db(ctx.env.DB);
    await call('POST', '/api/expenses', admin, EXPENSE_BODY, 'idem-keep-fresh');
    const hash = await fingerprintBody({ ...EXPENSE_BODY, description: 'expired submission' });
    ctx.sqlite
      .prepare(
        `INSERT INTO idempotency_keys (user_id, endpoint, key, request_hash, status, result_code, response_body, created_at, updated_at, expires_at)
         VALUES (?, 'POST /api/expenses', 'idem-purge-expired', ?, 'completed', 201, '{}', ?, ?, ?)`,
      )
      .run(
        'user-001',
        hash,
        new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      );

    await purgeExpiredIdempotencyKeys(db);

    const keys = (ctx.sqlite.prepare('SELECT key FROM idempotency_keys').all() as Array<{ key: string }>).map(
      (r) => r.key,
    );
    expect(keys).toContain('idem-keep-fresh');
    expect(keys).not.toContain('idem-purge-expired');
  });
});

describe('wrapper/lib units (local Hono + stubbed execution)', () => {
  const STAFF_ID = () => STAFF_USER_ID();

  const localApp = () => {
    const local = new Hono<{ Bindings: AppEnv; Variables: { db: ReturnType<typeof createD1Db>; auth: any } }>();
    local.use('*', async (c, next) => {
      c.set('db', createD1Db(ctx.env.DB));
      c.set('auth', { user: { id: STAFF_ID() }, roles: [], permissions: [] });
      await next();
    });
    return local;
  };

  const unitPost = (local: ReturnType<typeof localApp>, key: string, body: unknown) =>
    local.request(
      '/unit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: key },
        body: JSON.stringify(body),
      },
      ctx.env,
    );

  it('transient failure releases the claim; the retry then executes', async () => {
    const local = localApp();
    const db = createD1Db(ctx.env.DB);
    let boom = true;
    local.post('/unit', async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const outcome = await withIdempotency(c, {
        endpoint: 'POST /api/unit',
        body,
        successCode: 201,
        execute: (exec) => {
          if (boom) throw new Error('simulated transient outage');
          return createExpense(db, { ...EXPENSE_BODY, amount: 44000 }, exec ?? undefined);
        },
        rebuild: async (ddb, entityId) =>
          (await ddb.select().from(expenses).where(eq(expenses.id, entityId)).limit(1))[0],
      });
      return outcome.response;
    });

    const before = count.expenses();
    const first = await unitPost(local, 'idem-unit-01', { ...EXPENSE_BODY, amount: 44000 });
    expect(first.status).toBe(500);
    expect(rowFor('POST /api/unit', 'idem-unit-01')).toBeUndefined(); // released
    expect(count.expenses()).toBe(before); // failed attempt committed nothing

    boom = false;
    const retry = await unitPost(local, 'idem-unit-01', { ...EXPENSE_BODY, amount: 44000 });
    expect(retry.status).toBe(201);
    expect(rowFor('POST /api/unit', 'idem-unit-01')?.status).toBe('completed');
    expect(count.expenses()).toBe(before + 1);
  });
  it('tripwire: a duplicate bracket under one claim rolls back entirely', async () => {
    const db = createD1Db(ctx.env.DB);
    const before = count.expenses();
    const exec: IdempotencyExecution = {
      userId: STAFF_ID(),
      endpoint: 'POST /api/unit',
      key: 'idem-tripwire-1',
      requestHash: await fingerprintBody(EXPENSE_BODY),
      successCode: 201,
      now: new Date().toISOString(),
    };
    await db.insert(idempotencyKeys).values({
      userId: exec.userId,
      endpoint: exec.endpoint,
      key: exec.key,
      requestHash: exec.requestHash,
      status: 'in_progress',
      createdAt: exec.now,
      updatedAt: exec.now,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    const bracket = (id: string, description: string) => [
      db.insert(expenses).values({
        id,
        date: EXPENSE_BODY.date,
        category: EXPENSE_BODY.category,
        description,
        amount: EXPENSE_BODY.amount,
        status: 'Paid',
        createdAt: exec.now,
        updatedAt: exec.now,
      }),
      idempotencyPivot(exec, id),
      idempotencyTripwire(exec, id),
    ];

    // Execution A pivots the row to its own entity id and commits.
    await runAtomic(db, bracket('exp-tw-A', 'committed one'));
    expect(rowFor('POST /api/unit', 'idem-tripwire-1')?.entity_id).toBe('exp-tw-A');

    // Execution B re-runs the same key: its pivot cannot flip the completed
    // row, so its tripwire violates NOT NULL, its entity rolls back, and the
    // wrapper can detect the precise failure via the message probe.
    let lost: unknown;
    try {
      await runAtomic(db, bracket('exp-tw-B', 'duplicate clone'));
    } catch (err) {
      lost = err;
    }
    expect(lost).toBeDefined();
    expect(isIdempotencyLostRace(lost)).toBe(true);
    expect(count.expenses()).toBe(before + 1);
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM expenses WHERE id = ?').get('exp-tw-B') as { c: number }).c).toBe(0);
  });
});

/** The mock fixture's staff user id (used for cross-checking scope columns). */
function STAFF_USER_ID(): string {
  const row = ctx.sqlite.prepare('SELECT id FROM users WHERE email = ?').get('staff@hotel.com') as
    | { id: string }
    | undefined;
  if (!row) throw new Error('staff fixture missing');
  return row.id;
}
