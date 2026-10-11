import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from '../helpers/app';
import type { TestContext } from '../helpers/app';
import { queryLogFor } from '../helpers/fake-d1';

/**
 * QUERY BUDGETS (Block 0, 0.5). Number of D1 statements per request, measured
 * on unmodified code with the seeded database. Cloudflare bills D1 per
 * statement per invocation (50 Free / 1000 Paid), so the budgets may only go
 * DOWN: a block that lowers a count updates the number here (never up).
 *
 * `BASELINE` is the historical record (never edit); `BUDGET` is the ceiling
 * enforced by the test.
 */
let ctx: TestContext;
let admin: string;
let staff: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

async function measure(method: string, path: string, token?: string, body?: unknown) {
  const log = queryLogFor(ctx.sqlite);
  log.reset();
  const res = await ctx.app.request(
    path,
    { method, headers: jsonHeaders(token), body: body === undefined ? undefined : JSON.stringify(body) },
    ctx.env,
  );
  await res.text();
  return { status: res.status, statements: log.count };
}

const newStay = (roomId: string, roomNumber: string) => ({
  guestName: 'Budget Guest',
  source: 'direct',
  checkInDate: '2026-12-20',
  checkOutDate: '2026-12-22',
  notes: '',
  rooms: [{ roomId, roomNumber, roomTypeName: 'Standard' }],
  pricing: {
    mode: 'same',
    nightlyRates: [
      { date: '2026-12-20', rate: 400000 },
      { date: '2026-12-21', rate: 400000 },
    ],
    paymentType: 'no_dp',
    dpType: 'percentage',
  },
});

interface Case {
  name: string;
  run: () => Promise<{ status: number; statements: number }>;
  status: number;
  /** Statements measured on unmodified code (historical, never edited). */
  baseline: number;
  /** Ceiling enforced today; may only be lowered. */
  budget: number;
}

const cases: Case[] = [
  { name: 'POST /auth/login', run: () => measure('POST', '/api/auth/login', undefined, { email: 'manager@hotel.com', password: 'manager123' }), status: 200, baseline: 7, budget: 7 },
  { name: 'GET /auth/me', run: () => measure('GET', '/api/auth/me', admin), status: 200, baseline: 4, budget: 4 },
  { name: 'GET /users?pageSize=100', run: () => measure('GET', '/api/users?page=1&pageSize=100', admin), status: 200, baseline: 11, budget: 11 },
  { name: 'GET /users/:id', run: () => measure('GET', '/api/users/user-003', admin), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /roles?pageSize=100', run: () => measure('GET', '/api/roles?page=1&pageSize=100', admin), status: 200, baseline: 11, budget: 11 },
  { name: 'GET /roles/:id', run: () => measure('GET', '/api/roles/role-002', admin), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /permissions', run: () => measure('GET', '/api/permissions', admin), status: 200, baseline: 5, budget: 5 },
  { name: 'GET /rooms?pageSize=100', run: () => measure('GET', '/api/rooms?page=1&pageSize=100', staff), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /room-types?pageSize=100', run: () => measure('GET', '/api/room-types?page=1&pageSize=100', staff), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /reservations?pageSize=100', run: () => measure('GET', '/api/reservations?page=1&pageSize=100', staff), status: 200, baseline: 51, budget: 51 },
  { name: 'GET /reservations?pageSize=10', run: () => measure('GET', '/api/reservations?page=1&pageSize=10', staff), status: 200, baseline: 36, budget: 36 },
  { name: 'GET /reservations/:id', run: () => measure('GET', '/api/reservations/res-002', staff), status: 200, baseline: 7, budget: 7 },
  { name: 'GET /reservations/calendar', run: () => measure('GET', '/api/reservations/calendar?from=2026-09-01&to=2026-10-01', staff), status: 200, baseline: 19, budget: 19 },
  { name: 'GET /reservations/availability', run: () => measure('GET', '/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-18', staff), status: 200, baseline: 7, budget: 7 },
  { name: 'POST /reservations', run: () => measure('POST', '/api/reservations', staff, newStay('room-15', '15')), status: 201, baseline: 19, budget: 19 },
  { name: 'GET /invoices?pageSize=100', run: () => measure('GET', '/api/invoices?page=1&pageSize=100', admin), status: 200, baseline: 15, budget: 15 },
  { name: 'GET /invoices/:id', run: () => measure('GET', '/api/invoices/inv-001', admin), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /expenses?pageSize=100', run: () => measure('GET', '/api/expenses?page=1&pageSize=100', admin), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /sales?pageSize=100', run: () => measure('GET', '/api/sales?page=1&pageSize=100', admin), status: 200, baseline: 6, budget: 6 },
  { name: 'GET /sales/breakdown', run: () => measure('GET', '/api/sales/breakdown?start=2026-09-01&end=2026-09-30', admin), status: 200, baseline: 5, budget: 5 },
  { name: 'GET /reports/summary', run: () => measure('GET', '/api/reports/summary?start=2026-09-01&end=2026-09-30', admin), status: 200, baseline: 8, budget: 8 },
  { name: 'GET /reports/top-invoices', run: () => measure('GET', '/api/reports/top-invoices', admin), status: 200, baseline: 5, budget: 5 },
  { name: 'GET /dashboard/overview', run: () => measure('GET', '/api/dashboard/overview', admin), status: 200, baseline: 11, budget: 11 },
  { name: 'GET /activities?pageSize=100', run: () => measure('GET', '/api/activities?page=1&pageSize=100', admin), status: 200, baseline: 6, budget: 6 },
];

describe('query budgets (D1 statements per request)', () => {
  for (const c of cases) {
    it(`${c.name} stays within ${c.budget} statements (baseline ${c.baseline})`, async () => {
      const r = await c.run();
      expect(r.status).toBe(c.status);
      expect(r.statements).toBeLessThanOrEqual(c.budget);
    });
  }

  it('budgets never exceed their recorded baseline', () => {
    for (const c of cases) expect(c.budget, c.name).toBeLessThanOrEqual(c.baseline);
  });

  it('list endpoints scale per row today (N+1): documents the BE-027 cost model', async () => {
    const small = await measure('GET', '/api/reservations?page=1&pageSize=5', staff);
    const large = await measure('GET', '/api/reservations?page=1&pageSize=15', staff);
    // Baseline: statements grow with the number of rows returned. Block 7
    // replaces this with a constant (batched inArray) and tightens the budget.
    expect(large.statements).toBeGreaterThanOrEqual(small.statements);
  });
});
