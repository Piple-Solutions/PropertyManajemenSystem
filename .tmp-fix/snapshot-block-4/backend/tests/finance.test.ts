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

function newInvoice(overrides: Record<string, unknown> = {}) {
  return {
    guestName: 'Test Guest',
    source: 'direct',
    invoiceDate: '2026-09-22',
    items: [{ description: 'Room 101 - 1 night', quantity: 2, unitPrice: 500000 }],
    discount: 10,
    ...overrides,
  };
}

async function api(path: string, token: string | undefined, init: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return ctx.app.request(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } }, ctx.env);
}

describe('migration 0005_phase6_finance.sql', () => {
  it('creates invoices, invoice_items, expenses with constraints', () => {
    const tables = ctx.sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ n: string }>;
    const names = tables.map((t) => t.n);
    expect(names).toContain('invoices');
    expect(names).toContain('invoice_items');
    expect(names).toContain('expenses');
    // CHECK + UNIQUE enforcement
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO invoices (id, invoice_number, guest_name, source, invoice_date, subtotal, discount, total, payment_status, invoice_status, created_at, updated_at) VALUES ('x','INV-2026-900','G','direct','2026-09-01',0,0,0,'Bogus','Draft','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO invoices (id, invoice_number, guest_name, source, invoice_date, subtotal, discount, total, payment_status, invoice_status, created_at, updated_at) VALUES ('x','INV-2026-001','G','direct','2026-09-01',0,0,0,'Pending','Draft','t','t')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      ctx.sqlite
        .prepare(
          "INSERT INTO expenses (id, date, category, description, amount, status, created_at, updated_at) VALUES ('x','2026-09-01','Nope','d',100,'Paid','t','t')",
        )
        .run(),
    ).toThrow();
  });

  it('seeds 9 invoices (27 items) + 10 expenses + 5 finance permissions', () => {
    const inv = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoices').get() as { c: number };
    const items = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoice_items').get() as { c: number };
    const exp = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM expenses').get() as { c: number };
    const perms = ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM permissions WHERE resource = 'finance'").get() as { c: number };
    expect(inv.c).toBe(9);
    expect(items.c).toBe(27);
    expect(exp.c).toBe(10);
    expect(perms.c).toBe(10); // 5 existing + 5 backend-required
    const grants = ctx.sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.name LIKE 'finance.%' AND rp.role_id IN ('role-001','role-002')",
      )
      .get() as { c: number };
    expect(grants.c).toBe(20); // 10 perms x 2 roles
  });
});

describe('invoices API', () => {
  it('lists with pagination + detail shape matches the frontend contract', async () => {
    const list = await api('/api/invoices?page=1&pageSize=100', adminToken);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.pagination.total).toBe(9);
    const first = body.data[0] as Record<string, unknown>;
    for (const key of ['id', 'invoiceNumber', 'guestName', 'source', 'invoiceDate', 'items', 'subtotal', 'discount', 'total', 'paymentStatus', 'invoiceStatus', 'createdAt', 'updatedAt']) {
      expect(first).toHaveProperty(key);
    }
    expect(first).not.toHaveProperty('dueDate');
    const detail = await api('/api/invoices/inv-007', adminToken);
    expect(detail.status).toBe(200);
    const inv = (await detail.json()) as { data: { items: unknown[]; subtotal: number; discount: number; total: number; reservationId: string } };
    expect(inv.data.items).toHaveLength(2);
    expect(inv.data.subtotal).toBe(4200000);
    expect(inv.data.discount).toBe(10);
    expect(inv.data.total).toBe(3780000);
    expect(inv.data.reservationId).toBe('res-011');
  });

  it('creates with server-side percent totals, ignoring client math', async () => {
    const res = await api('/api/invoices', adminToken, {
      method: 'POST',
      body: JSON.stringify({ ...newInvoice(), subtotal: 1, total: 1, invoiceNumber: 'INV-2026-101' }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { data: { subtotal: number; total: number; discount: number; invoiceNumber: string; paymentStatus: string; invoiceStatus: string } };
    expect(created.data.subtotal).toBe(1000000);
    expect(created.data.total).toBe(900000); // 10% percent, not absolute
    expect(created.data.invoiceNumber).toBe('INV-2026-101');
    expect(created.data.paymentStatus).toBe('Pending');
    expect(created.data.invoiceStatus).toBe('Draft');
  });

  it('auto-allocates the next INV-YYYY-NNN number and survives collisions', async () => {
    const a = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice()) });
    expect(a.status).toBe(201);
    const ja = (await a.json()) as { data: { invoiceNumber: string } };
    expect(ja.data.invoiceNumber).toBe('INV-2026-010');
    // Client count+1 collision falls back to server allocation instead of 409.
    const b = await api('/api/invoices', adminToken, {
      method: 'POST',
      body: JSON.stringify(newInvoice({ invoiceNumber: 'INV-2026-009' })),
    });
    expect(b.status).toBe(201);
    const jb = (await b.json()) as { data: { invoiceNumber: string } };
    expect(jb.data.invoiceNumber).toBe('INV-2026-011');
  });

  it('validates input (422) and reservation linkage (409)', async () => {
    const bad = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice({ guestName: 'X' })) });
    expect(bad.status).toBe(422);
    const over = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice({ discount: 101 })) });
    expect(over.status).toBe(422);
    const noItems = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice({ items: [] })) });
    expect(noItems.status).toBe(422);
    const badRes = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice({ reservationId: 'res-missing' })) });
    expect(badRes.status).toBe(409);
    const completed = await api('/api/invoices', adminToken, {
      method: 'POST',
      body: JSON.stringify(newInvoice({ invoiceStatus: 'Completed', paymentStatus: 'Pending' })),
    });
    expect(completed.status).toBe(422);
  });

  it('accepts the wide frontend status literals for forward compat', async () => {
    const res = await api('/api/invoices', adminToken, {
      method: 'POST',
      body: JSON.stringify(newInvoice({ invoiceNumber: 'INV-2026-102', paymentStatus: 'Partial', invoiceStatus: 'Sent' })),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { data: { paymentStatus: string; invoiceStatus: string } };
    expect(created.data.paymentStatus).toBe('Partial');
    expect(created.data.invoiceStatus).toBe('Sent');
  });

  it('supports search/status/payment filters', async () => {
    const s = await api('/api/invoices?search=jane&page=1&pageSize=100', adminToken);
    expect(((await s.json()) as { pagination: { total: number } }).pagination.total).toBe(1);
    const st = await api('/api/invoices?status=Draft&page=1&pageSize=100', adminToken);
    expect(((await st.json()) as { pagination: { total: number } }).pagination.total).toBe(5);
    const pay = await api('/api/invoices?payment=Paid&page=1&pageSize=100', adminToken);
    expect(((await pay.json()) as { pagination: { total: number } }).pagination.total).toBe(4);
  });

  it('updates + recomputes, rejects terminal edits (409)', async () => {
    const upd = await api('/api/invoices/inv-003', adminToken, {
      method: 'PATCH',
      body: JSON.stringify({ discount: 20, items: [{ description: 'Room', quantity: 1, unitPrice: 1000000 }] }),
    });
    expect(upd.status).toBe(200);
    const ju = (await upd.json()) as { data: { subtotal: number; total: number } };
    expect(ju.data.subtotal).toBe(1000000);
    expect(ju.data.total).toBe(800000);
    const term = await api('/api/invoices/inv-001', adminToken, { method: 'PATCH', body: JSON.stringify({ guestName: 'Nope' }) });
    expect(term.status).toBe(409);
  });

  it('send/pay/cancel follow the frontend transition matrix', async () => {
    const send = await api('/api/invoices/inv-003/send', adminToken, { method: 'POST' });
    expect(send.status).toBe(200);
    expect(((await send.json()) as { data: { invoiceStatus: string } }).data.invoiceStatus).toBe('Sent');
    const sendAgain = await api('/api/invoices/inv-003/send', adminToken, { method: 'POST' });
    expect(sendAgain.status).toBe(409);

    const pay = await api('/api/invoices/inv-003/pay', adminToken, { method: 'POST' });
    expect(pay.status).toBe(200);
    const paid = (await pay.json()) as { data: { invoiceStatus: string; paymentStatus: string } };
    expect(paid.data.invoiceStatus).toBe('Completed');
    expect(paid.data.paymentStatus).toBe('Paid'); // atomic flip
    const payAgain = await api('/api/invoices/inv-003/pay', adminToken, { method: 'POST' });
    expect(payAgain.status).toBe(409);

    const cancel = await api('/api/invoices/inv-004/cancel', adminToken, { method: 'POST' });
    expect(cancel.status).toBe(200);
    expect(((await cancel.json()) as { data: { invoiceStatus: string } }).data.invoiceStatus).toBe('Cancelled');
    const cancelDone = await api('/api/invoices/inv-001/cancel', adminToken, { method: 'POST' });
    expect(cancelDone.status).toBe(409);
  });

  it('deletes and never mutates the linked reservation', async () => {
    const before = ctx.sqlite.prepare("SELECT total_amount AS t FROM reservations WHERE id = 'res-003'").get() as { t: number };
    const del = await api('/api/invoices/inv-003', adminToken, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await api('/api/invoices/inv-003', adminToken)).status).toBe(404);
    const after = ctx.sqlite.prepare("SELECT total_amount AS t FROM reservations WHERE id = 'res-003'").get() as { t: number };
    expect(after.t).toBe(before.t);
  });

  it('next-number preview keeps the INV-YYYY-NNN format', async () => {
    const res = await api('/api/invoices/next-number?date=2026-09-22', adminToken);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { invoiceNumber: string } }).data.invoiceNumber).toBe('INV-2026-010');
  });
});

describe('expenses API', () => {
  it('lists seed + creates/updates/deletes with enum validation', async () => {
    const list = await api('/api/expenses?page=1&pageSize=100', adminToken);
    expect(((await list.json()) as { pagination: { total: number } }).pagination.total).toBe(10);

    const created = await api('/api/expenses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ date: '2026-09-22', category: 'Supplies', description: 'Paper', amount: 250000 }),
    });
    expect(created.status).toBe(201);
    const jc = (await created.json()) as { data: { id: string; status: string } };
    expect(jc.data.status).toBe('Pending');

    const badCat = await api('/api/expenses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ date: '2026-09-22', category: 'Nope', description: 'x', amount: 1 }),
    });
    expect(badCat.status).toBe(422);
    const badAmt = await api('/api/expenses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ date: '2026-09-22', category: 'Supplies', description: 'x', amount: 0 }),
    });
    expect(badAmt.status).toBe(422);

    const upd = await api(`/api/expenses/${jc.data.id}`, adminToken, { method: 'PATCH', body: JSON.stringify({ status: 'Paid' }) });
    expect(upd.status).toBe(200);
    expect(((await upd.json()) as { data: { status: string } }).data.status).toBe('Paid');

    const cat = await api('/api/expenses?category=Utilities&page=1&pageSize=100', adminToken);
    expect(((await cat.json()) as { pagination: { total: number } }).pagination.total).toBe(2);

    expect((await api(`/api/expenses/${jc.data.id}`, adminToken, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/expenses/${jc.data.id}`, adminToken)).status).toBe(404);
  });
});

describe('sales + reports (derived, read-only)', () => {
  it('derives 9 sales from non-cancelled invoices in the frontend shape', async () => {
    const res = await api('/api/sales?page=1&pageSize=100', adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; invoiceId: string; date: string; amount: number; source: string; description: string }>; pagination: { total: number } };
    expect(body.pagination.total).toBe(9);
    const row = body.data.find((s) => s.invoiceId === 'inv-002')!;
    expect(row.date).toBe('2026-09-16');
    expect(row.amount).toBe(2160000);
    expect(row.source).toBe('whatsapp');
    expect(row.description).toContain('Jane Smith');
  });

  it('sales breakdown mirrors getSourceBreakdown percentages', async () => {
    const res = await api('/api/sales/breakdown?start=2026-09-01&end=2026-09-30', adminToken);
    const rows = (await res.json()) as { data: Array<{ source: string; totalSales: number; count: number; percentage: number }> };
    const total = rows.data.reduce((s, r) => s + r.totalSales, 0);
    expect(total).toBe(1500000 + 2160000 + 1500000 + 3600000 + 1800000 + 1500000 + 3780000 + 2300000 + 22975750);
    expect(rows.data.reduce((s, r) => s + r.percentage, 0)).toBeGreaterThan(95);
  });

  it('report summary matches the frontend reportService formula', async () => {
    const res = await api('/api/reports/summary?start=2026-09-01&end=2026-09-30', adminToken);
    expect(res.status).toBe(200);
    const s = (await res.json()) as { data: { totalSales: number; totalIncome: number; totalExpenses: number; netRevenue: number; totalInvoices: number; paidInvoices: number; pendingInvoices: number; overdueInvoices: number; expenseByCategory: unknown[] } };
    expect(s.data.totalInvoices).toBe(9);
    expect(s.data.paidInvoices).toBe(4);
    expect(s.data.pendingInvoices).toBe(5);
    expect(s.data.overdueInvoices).toBe(0);
    expect(s.data.totalIncome).toBe(s.data.totalSales);
    expect(s.data.netRevenue).toBe(s.data.totalSales - s.data.totalExpenses);
    expect(s.data.totalExpenses).toBe(2500000 + 45000000 + 1500000 + 800000 + 3000000 + 900000 + 500000);
    const filtered = await api('/api/reports/summary?start=2026-09-01&end=2026-09-30&categories=Utilities', adminToken);
    const f = (await filtered.json()) as { data: { totalExpenses: number } };
    expect(f.data.totalExpenses).toBe(2500000 + 900000);
    const multi = await api('/api/reports/summary?start=2026-09-01&end=2026-09-30&categories=Utilities,Staff', adminToken);
    const m = (await multi.json()) as { data: { totalExpenses: number } };
    expect(m.data.totalExpenses).toBe(2500000 + 900000 + 45000000);
    const top = await api('/api/reports/top-invoices?limit=3', adminToken);
    const tops = (await top.json()) as { data: Array<{ total: number }> };
    expect(tops.data).toHaveLength(3);
    expect(tops.data[0].total).toBe(22975750);
  });
});

describe('finance RBAC + audit', () => {
  it('rejects unauthenticated (401) and staff without finance perms (403)', async () => {
    expect((await api('/api/invoices', undefined)).status).toBe(401);
    expect((await api('/api/invoices', staffToken)).status).toBe(403);
    expect((await api('/api/invoices', staffToken, { method: 'POST', body: JSON.stringify(newInvoice()) })).status).toBe(403);
    expect((await api('/api/expenses', staffToken)).status).toBe(403);
    expect((await api('/api/sales', staffToken)).status).toBe(403);
    expect((await api('/api/reports/summary?start=2026-09-01&end=2026-09-30', staffToken)).status).toBe(403);
  });

  it('writes append-only finance audit rows (never readable as writes)', async () => {
    const before = (ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM activities WHERE category = 'finance'").get() as { c: number }).c;
    const created = await api('/api/invoices', adminToken, { method: 'POST', body: JSON.stringify(newInvoice({ invoiceNumber: 'INV-2026-110' })) });
    const jc = (await created.json()) as { data: { id: string } };
    await api(`/api/invoices/${jc.data.id}/send`, adminToken, { method: 'POST' });
    await api(`/api/invoices/${jc.data.id}/pay`, adminToken, { method: 'POST' });
    const exp = await api('/api/expenses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ date: '2026-09-22', category: 'Other', description: 'Audit me', amount: 1000 }),
    });
    const je = (await exp.json()) as { data: { id: string } };
    await api(`/api/expenses/${je.data.id}`, adminToken, { method: 'PATCH', body: JSON.stringify({ status: 'Paid' }) });
    await api(`/api/expenses/${je.data.id}`, adminToken, { method: 'DELETE' });
    await api(`/api/invoices/${jc.data.id}`, adminToken, { method: 'DELETE' });
    const rows = ctx.sqlite
      .prepare("SELECT action AS a FROM activities WHERE category = 'finance' ORDER BY created_at, id")
      .all() as Array<{ a: string }>;
    for (const a of ['invoice_create', 'invoice_send', 'invoice_pay', 'invoice_delete', 'expense_create', 'expense_update', 'expense_delete']) {
      expect(rows.map((r) => r.a)).toContain(a);
    }
    expect(rows.length).toBeGreaterThan(before);
    // No audit-write endpoint exists.
    expect((await api('/api/activities', adminToken, { method: 'POST', body: JSON.stringify({}) })).status).toBe(404);
  });
});
