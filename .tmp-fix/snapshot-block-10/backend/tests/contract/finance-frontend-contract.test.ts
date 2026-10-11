import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from '../helpers/app';
import type { TestContext } from '../helpers/app';

/**
 * FINANCE FRONTEND CONTRACT (Block 9B, FE-001). Additive to
 * `frontend-contract.test.ts`: every request below is EXACTLY what the new
 * `frontend/src/services/{invoice,expense,sales}Service.ts` send, and every
 * assertion is a field or status those services / the finance pages read.
 * This is the verification of the integration (the agent cannot run e2e).
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

/** `fetchAllPages(path)` from api.ts: page=1.. with pageSize=100 until `total` is reached. */
async function fetchAllPages(path: string, token: string) {
  const rows: any[] = [];
  const joiner = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= 20; page += 1) {
    const res = await call('GET', `${path}${joiner}page=${page}&pageSize=100`, token);
    if (res.status !== 200) return { status: res.status, rows, requests: page };
    rows.push(...res.json.data);
    if (res.json.data.length < 100 || rows.length >= res.json.pagination.total) return { status: 200, rows, requests: page };
  }
  return { status: 200, rows, requests: 20 };
}

/** `toBody()` of invoiceService: only the editable fields, never ids/subtotals/totals. */
const formPayload = (over: Record<string, unknown> = {}) => ({
  invoiceNumber: 'INV-2026-300',
  guestName: 'Form Guest',
  source: 'direct',
  invoiceDate: '2026-09-20',
  items: [
    { description: 'Room 04 - 2 nights', quantity: 2, unitPrice: 600000 },
    { description: 'Breakfast', quantity: 4, unitPrice: 25000 },
  ],
  discount: 10,
  ...over,
});

const INVOICE_FIELDS = ['id', 'invoiceNumber', 'guestName', 'source', 'invoiceDate', 'items', 'subtotal', 'discount', 'total', 'paymentStatus', 'invoiceStatus', 'createdAt', 'updatedAt'];

describe('finance contract: invoiceService reads', () => {
  it('getAll(): paged list in the Invoice shape, one request for <= 100 rows', async () => {
    const all = await fetchAllPages('/api/invoices', admin);
    expect(all.status).toBe(200);
    expect(all.requests).toBe(1);
    expect(all.rows.length).toBe(9);
    for (const inv of all.rows) {
      for (const f of INVOICE_FIELDS) expect(inv, f).toHaveProperty(f);
      for (const it of inv.items) {
        for (const f of ['id', 'invoiceId', 'description', 'quantity', 'unitPrice', 'subtotal']) expect(it, f).toHaveProperty(f);
      }
      expect(inv).not.toHaveProperty('totalPaid'); // settlement falls back to paymentStatus
    }
  });

  it('getAll() follows pagination past 100 rows without gaps or duplicates', async () => {
    const ins = ctx.sqlite.prepare(
      "INSERT INTO invoices (id, invoice_number, guest_name, source, invoice_date, subtotal, discount, total, payment_status, invoice_status, created_at, updated_at) VALUES (?, ?, 'Bulk', 'direct', '2026-09-01', 1, 0, 1, 'Pending', 'Draft', 't', 't')",
    );
    for (let i = 0; i < 230; i += 1) ins.run(`bulk-${i}`, `INV-2025-${String(i + 1).padStart(4, '0')}`);
    const all = await fetchAllPages('/api/invoices', admin);
    expect(all.requests).toBe(3);
    expect(all.rows.length).toBe(239);
    expect(new Set(all.rows.map((r) => r.id)).size).toBe(239);
  });

  it('getById(): 200 with the invoice, 404 for an unknown id (service returns undefined)', async () => {
    expect((await call('GET', '/api/invoices/inv-001', admin)).json.data.id).toBe('inv-001');
    expect((await call('GET', '/api/invoices/does-not-exist', admin)).status).toBe(404);
  });

  it('getNextNumber(date): { data: { invoiceNumber } }', async () => {
    const res = await call('GET', '/api/invoices/next-number?date=2026-09-20', admin);
    expect(res.status).toBe(200);
    expect(res.json.data.invoiceNumber).toMatch(/^INV-2026-\d{3,}$/);
  });

  it('getAllIfPermitted(): a user without finance permissions gets 403 (the service maps it to [])', async () => {
    for (const path of ['/api/invoices', '/api/expenses', '/api/sales']) {
      expect((await fetchAllPages(path, staff)).status, path).toBe(403);
    }
    expect((await call('GET', '/api/invoices/next-number', staff)).status).toBe(403);
  });
});

describe('finance contract: invoiceService writes (form payload, no status)', () => {
  it('create(): the server computes subtotal/total from items and the PERCENT discount', async () => {
    const res = await call('POST', '/api/invoices', admin, formPayload());
    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      invoiceNumber: 'INV-2026-300',
      subtotal: 1300000,
      discount: 10,
      total: 1170000,
      invoiceStatus: 'Draft',
      paymentStatus: 'Pending',
    });
    expect(res.json.data.items).toHaveLength(2);
  });

  it('create() with a number that is already taken still succeeds with the next free number', async () => {
    const res = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-001' }));
    expect(res.status).toBe(201);
    expect(res.json.data.invoiceNumber).not.toBe('INV-2026-001');
  });

  it('status chosen in the form is applied by the matching action after saving (Sent / Completed+Paid / Cancelled)', async () => {
    const sent = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-301' }));
    const sentAfter = await call('POST', `/api/invoices/${sent.json.data.id}/send`, admin);
    expect(sentAfter.status).toBe(200);
    expect(sentAfter.json.data).toMatchObject({ invoiceStatus: 'Sent', paymentStatus: 'Pending' });

    const paid = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-302' }));
    const paidAfter = await call('POST', `/api/invoices/${paid.json.data.id}/pay`, admin);
    expect(paidAfter.json.data).toMatchObject({ invoiceStatus: 'Completed', paymentStatus: 'Paid' });

    const cancelled = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-303' }));
    const cancelledAfter = await call('POST', `/api/invoices/${cancelled.json.data.id}/cancel`, admin);
    expect(cancelledAfter.json.data.invoiceStatus).toBe('Cancelled');
  });

  it('a combination with no action (Overdue / Partial) is sent WITH its status and refused with a readable message; nothing is created', async () => {
    const before = (await fetchAllPages('/api/invoices', admin)).rows.length;
    for (const over of [{ paymentStatus: 'Partial', invoiceStatus: 'Draft' }, { paymentStatus: 'Overdue', invoiceStatus: 'Draft' }, { paymentStatus: 'Paid', invoiceStatus: 'Draft' }]) {
      const res = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-310', ...over }));
      expect(res.status).toBe(422);
      const shown = Object.values(res.json.errors as Record<string, string[]>).flat().join(' ');
      expect(shown).toMatch(/send, pay, atau cancel/);
    }
    expect((await fetchAllPages('/api/invoices', admin)).rows.length).toBe(before);
  });

  it('update(): PATCH without status keeps the status and recomputes totals; then an action may follow', async () => {
    const made = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-320' }));
    const id = made.json.data.id;
    const patched = await call('PATCH', `/api/invoices/${id}`, admin, formPayload({ invoiceNumber: 'INV-2026-320', guestName: 'Edited Guest', discount: 0 }));
    expect(patched.status).toBe(200);
    expect(patched.json.data).toMatchObject({ guestName: 'Edited Guest', total: 1300000, invoiceStatus: 'Draft', paymentStatus: 'Pending' });
    expect((await call('POST', `/api/invoices/${id}/pay`, admin)).json.data.invoiceStatus).toBe('Completed');
    // Completed invoices are locked: the form's save is refused with a message the page shows.
    const locked = await call('PATCH', `/api/invoices/${id}`, admin, formPayload({ invoiceNumber: 'INV-2026-320' }));
    expect(locked.status).toBe(409);
    expect(typeof locked.json.message).toBe('string');
  });

  it('update(): moving a Sent invoice back to Draft has no action and is refused (422)', async () => {
    const made = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-321' }));
    const id = made.json.data.id;
    await call('POST', `/api/invoices/${id}/send`, admin);
    const back = await call('PATCH', `/api/invoices/${id}`, admin, { ...formPayload({ invoiceNumber: 'INV-2026-321' }), invoiceStatus: 'Draft', paymentStatus: 'Pending' });
    expect(back.status).toBe(422);
    expect((await call('GET', `/api/invoices/${id}`, admin)).json.data.invoiceStatus).toBe('Sent');
  });

  it('delete(): 204 for a Draft, 409 with a message for anything else', async () => {
    const draft = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-330' }));
    expect((await call('DELETE', `/api/invoices/${draft.json.data.id}`, admin)).status).toBe(204);
    const refused = await call('DELETE', '/api/invoices/inv-001', admin);
    expect(refused.status).toBe(409);
    expect(refused.json.message).toMatch(/Draft/);
  });

  it('send / markPaid / cancel: 200 on a legal move, 409 with a message on an illegal one', async () => {
    const made = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-340' }));
    const id = made.json.data.id;
    expect((await call('POST', `/api/invoices/${id}/pay`, admin)).status).toBe(200);
    for (const action of ['send', 'pay', 'cancel']) {
      const res = await call('POST', `/api/invoices/${id}/${action}`, admin);
      expect(res.status, action).toBe(409);
      expect(typeof res.json.message, action).toBe('string');
    }
  });

  it('form validation errors come back as { errors: { field: string[] } } for apiErrorMessage', async () => {
    const res = await call('POST', '/api/invoices', admin, formPayload({ guestName: 'X', items: [] }));
    expect(res.status).toBe(422);
    expect(Object.values(res.json.errors as Record<string, string[]>).flat().length).toBeGreaterThan(0);
  });
});

describe('finance contract: expenseService', () => {
  it('getAll(): Expense rows with a status; create(): the form payload is accepted', async () => {
    const all = await fetchAllPages('/api/expenses', admin);
    expect(all.status).toBe(200);
    for (const e of all.rows) {
      for (const f of ['id', 'date', 'category', 'description', 'amount', 'status', 'createdAt', 'updatedAt']) expect(e, f).toHaveProperty(f);
    }
    const made = await call('POST', '/api/expenses', admin, { date: '2026-09-21', category: 'Supplies', description: 'Form expense', amount: 125000, status: 'Pending' });
    expect(made.status).toBe(201);
    expect(made.json.data).toMatchObject({ category: 'Supplies', amount: 125000, status: 'Pending' });
    expect((await fetchAllPages('/api/expenses', admin)).rows.length).toBe(all.rows.length + 1);
  });

  it('create() with an invalid category or amount is 422 with field errors', async () => {
    const res = await call('POST', '/api/expenses', admin, { date: '2026-09-21', category: 'Nope', description: 'x', amount: 0 });
    expect(res.status).toBe(422);
    expect(res.json.errors).toBeDefined();
  });
});

describe('finance contract: salesService', () => {
  it('getAll(): derived sales in the Sale shape (one per non-cancelled invoice), dates inside the row', async () => {
    const all = await fetchAllPages('/api/sales', admin);
    expect(all.status).toBe(200);
    expect(all.rows.length).toBeGreaterThan(0);
    for (const s of all.rows) {
      for (const f of ['id', 'date', 'amount', 'source', 'description', 'invoiceId']) expect(s, f).toHaveProperty(f);
      expect(typeof s.amount).toBe('number');
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('a new Draft invoice appears as a sale immediately and disappears when cancelled (what the dashboard tiles will show)', async () => {
    const before = (await fetchAllPages('/api/sales', admin)).rows.length;
    const made = await call('POST', '/api/invoices', admin, formPayload({ invoiceNumber: 'INV-2026-350' }));
    expect((await fetchAllPages('/api/sales', admin)).rows.length).toBe(before + 1);
    await call('POST', `/api/invoices/${made.json.data.id}/cancel`, admin);
    expect((await fetchAllPages('/api/sales', admin)).rows.length).toBe(before);
  });
});
