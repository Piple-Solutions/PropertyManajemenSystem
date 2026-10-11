import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

/**
 * Block 6 regression tests: BE-019 (delete only Draft), BE-020 (status only
 * through action endpoints), BE-022 (billed vs paid), BE-031 (upper bounds),
 * plus inclusive date-bound checks for the finance read endpoints.
 */
let ctx: TestContext;
let admin: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
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

const invoice = (over: Record<string, unknown> = {}) => ({
  guestName: 'Lifecycle Guest',
  source: 'direct',
  invoiceDate: '2026-09-18',
  items: [{ description: 'Room', quantity: 1, unitPrice: 1000000 }],
  ...over,
});

async function make(over: Record<string, unknown> = {}) {
  const res = await call('POST', '/api/invoices', admin, invoice(over));
  expect(res.status).toBe(201);
  return res.json.data as any;
}

const rowCount = (id: string) =>
  (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoices WHERE id = ?').get(id) as { c: number }).c;

describe('BE-019: only Draft invoices can be deleted', () => {
  it('Draft: 204 and gone', async () => {
    const inv = await make();
    expect((await call('DELETE', `/api/invoices/${inv.id}`, admin)).status).toBe(204);
    expect(rowCount(inv.id)).toBe(0);
  });

  it('Sent, Completed/Paid and Cancelled: 409 with a message to cancel, row and items untouched', async () => {
    const sent = await make();
    await call('POST', `/api/invoices/${sent.id}/send`, admin);
    const paid = await make();
    await call('POST', `/api/invoices/${paid.id}/pay`, admin);
    const cancelled = await make();
    await call('POST', `/api/invoices/${cancelled.id}/cancel`, admin);

    for (const [label, inv] of [['Sent', sent], ['Paid', paid], ['Cancelled', cancelled]] as const) {
      const res = await call('DELETE', `/api/invoices/${inv.id}`, admin);
      expect(res.status, label).toBe(409);
      expect(res.json.message, label).toMatch(/hanya invoice Draft yang dapat dihapus|Hanya invoice Draft yang dapat dihapus/i);
      expect(rowCount(inv.id), label).toBe(1);
      const items = ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM invoice_items WHERE invoice_id = ?').get(inv.id) as { c: number };
      expect(items.c, label).toBe(1);
    }
  });

  it('PoC: a Completed/Paid seed invoice can no longer be deleted, so its number is never reused', async () => {
    const before = await call('GET', '/api/invoices/next-number?date=2026-09-18', admin);
    expect((await call('DELETE', '/api/invoices/inv-009', admin)).status).toBe(409);
    const after = await call('GET', '/api/invoices/next-number?date=2026-09-18', admin);
    expect(after.json.data.invoiceNumber).toBe(before.json.data.invoiceNumber);
    expect((await call('GET', '/api/invoices/inv-009', admin)).status).toBe(200);
  });

  it('a rejected delete writes no audit row', async () => {
    const paid = await make();
    await call('POST', `/api/invoices/${paid.id}/pay`, admin);
    const before = (ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM activities WHERE action = 'invoice_delete'").get() as { c: number }).c;
    await call('DELETE', `/api/invoices/${paid.id}`, admin);
    expect((ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM activities WHERE action = 'invoice_delete'").get() as { c: number }).c).toBe(before);
  });
});

describe('BE-020: status changes only through send / pay / cancel', () => {
  it('create rejects any non-default status (PoC: Completed + Paid revenue without finance.invoice.update)', async () => {
    for (const [label, over] of [
      ['Completed+Paid', { invoiceStatus: 'Completed', paymentStatus: 'Paid' }],
      ['Sent', { invoiceStatus: 'Sent' }],
      ['Cancelled', { invoiceStatus: 'Cancelled' }],
      ['Paid payment', { paymentStatus: 'Paid' }],
      ['Partial payment', { paymentStatus: 'Partial' }],
    ] as const) {
      const res = await call('POST', '/api/invoices', admin, invoice(over));
      expect(res.status, label).toBe(422);
      expect(JSON.stringify(res.json.errors), label).toMatch(/send, pay, atau cancel/);
    }
    expect((ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM invoices WHERE guest_name = 'Lifecycle Guest'").get() as { c: number }).c).toBe(0);
  });

  it('create still accepts the defaults when sent explicitly (what the form posts)', async () => {
    const res = await call('POST', '/api/invoices', admin, invoice({ invoiceStatus: 'Draft', paymentStatus: 'Pending' }));
    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({ invoiceStatus: 'Draft', paymentStatus: 'Pending' });
  });

  it('PATCH cannot move status in any direction (PoC: Sent -> Draft + Paid)', async () => {
    const inv = await make();
    await call('POST', `/api/invoices/${inv.id}/send`, admin);
    const back = await call('PATCH', `/api/invoices/${inv.id}`, admin, { invoiceStatus: 'Draft', paymentStatus: 'Paid' });
    expect(back.status).toBe(422);
    const other = await make();
    expect((await call('PATCH', `/api/invoices/${other.id}`, admin, { paymentStatus: 'Paid' })).status).toBe(422);
    expect((await call('PATCH', `/api/invoices/${other.id}`, admin, { invoiceStatus: 'Cancelled' })).status).toBe(422);
    const now = await call('GET', `/api/invoices/${inv.id}`, admin);
    expect(now.json.data).toMatchObject({ invoiceStatus: 'Sent', paymentStatus: 'Pending' });
  });

  it('PATCH with the CURRENT status values is a no-op and still works; other edits unaffected', async () => {
    const inv = await make();
    const res = await call('PATCH', `/api/invoices/${inv.id}`, admin, {
      invoiceStatus: 'Draft',
      paymentStatus: 'Pending',
      guestName: 'Renamed Guest',
      discount: 10,
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ guestName: 'Renamed Guest', invoiceStatus: 'Draft', total: 900000 });
  });

  it('the action endpoints still do the transitions (send, pay, cancel) and refuse illegal ones', async () => {
    const a = await make();
    expect((await call('POST', `/api/invoices/${a.id}/send`, admin)).json.data.invoiceStatus).toBe('Sent');
    const paid = await call('POST', `/api/invoices/${a.id}/pay`, admin);
    expect(paid.json.data).toMatchObject({ invoiceStatus: 'Completed', paymentStatus: 'Paid' });
    expect((await call('POST', `/api/invoices/${a.id}/cancel`, admin)).status).toBe(409);
    expect((await call('POST', `/api/invoices/${a.id}/send`, admin)).status).toBe(409);
  });
});

describe('BE-022: billed vs paid are explicit (legacy fields unchanged)', () => {
  it('GET /api/reports/revenue separates billed, paid and unpaid; legacy summary is unchanged', async () => {
    // A far-future month: the seed has expenses in 2026, which this test must not mix with.
    const q = '?start=2030-10-01&end=2030-10-31';
    const empty = (await call('GET', `/api/reports/revenue${q}`, admin)).json.data;
    expect(empty).toMatchObject({ billedTotal: 0, paidTotal: 0, unpaidTotal: 0, billedCount: 0, paidCount: 0 });

    const draft = await make({ invoiceDate: '2030-10-05', items: [{ description: 'A', quantity: 1, unitPrice: 5000000 }] });
    const sent = await make({ invoiceDate: '2030-10-06', items: [{ description: 'B', quantity: 1, unitPrice: 2000000 }] });
    await call('POST', `/api/invoices/${sent.id}/send`, admin);
    const paid = await make({ invoiceDate: '2030-10-07', items: [{ description: 'C', quantity: 1, unitPrice: 3000000 }] });
    await call('POST', `/api/invoices/${paid.id}/pay`, admin);
    const cancelled = await make({ invoiceDate: '2030-10-08', items: [{ description: 'D', quantity: 1, unitPrice: 9000000 }] });
    await call('POST', `/api/invoices/${cancelled.id}/cancel`, admin);

    const rev = (await call('GET', `/api/reports/revenue${q}`, admin)).json.data;
    expect(rev).toMatchObject({
      billedTotal: 10000000, // draft + sent + paid (cancelled excluded)
      paidTotal: 3000000,
      unpaidTotal: 7000000,
      billedCount: 3,
      paidCount: 1,
      unpaidCount: 2,
      totalExpenses: 0,
      netBilled: 10000000,
      netPaid: 3000000,
    });

    // Legacy report: a Draft still counts as sales (documented, unchanged).
    const legacy = (await call('GET', `/api/reports/summary${q}`, admin)).json.data;
    expect(legacy.totalSales).toBe(10000000);
    expect(legacy.totalIncome).toBe(10000000);
    expect(legacy.netRevenue).toBe(10000000);
    expect(Object.keys(legacy).sort()).toEqual([
      'expenseByCategory', 'netRevenue', 'overdueInvoices', 'paidInvoices', 'pendingInvoices', 'totalExpenses', 'totalIncome', 'totalInvoices', 'totalSales',
    ]);
    expect(draft.id).toBeTruthy();
  });

  it('net paid subtracts expenses in range; expense bounds are inclusive', async () => {
    const paid = await make({ invoiceDate: '2026-11-01', items: [{ description: 'C', quantity: 1, unitPrice: 4000000 }] });
    await call('POST', `/api/invoices/${paid.id}/pay`, admin);
    await call('POST', '/api/expenses', admin, { date: '2026-11-01', category: 'Other', description: 'on start', amount: 100000 });
    await call('POST', '/api/expenses', admin, { date: '2026-11-30', category: 'Other', description: 'on end', amount: 200000 });
    await call('POST', '/api/expenses', admin, { date: '2026-10-31', category: 'Other', description: 'day before', amount: 400000 });
    await call('POST', '/api/expenses', admin, { date: '2026-12-01', category: 'Other', description: 'day after', amount: 800000 });
    const rev = (await call('GET', '/api/reports/revenue?start=2026-11-01&end=2026-11-30', admin)).json.data;
    expect(rev).toMatchObject({ paidTotal: 4000000, totalExpenses: 300000, netPaid: 3700000 });
  });

  it('GET /api/sales/summary: billed/paid per source; legacy /api/sales rows unchanged', async () => {
    const a = await make({ invoiceDate: '2026-12-02', source: 'ota', items: [{ description: 'A', quantity: 1, unitPrice: 1000000 }] });
    await call('POST', `/api/invoices/${a.id}/pay`, admin);
    await make({ invoiceDate: '2026-12-03', source: 'ota', items: [{ description: 'B', quantity: 1, unitPrice: 500000 }] });
    await make({ invoiceDate: '2026-12-04', source: 'direct', items: [{ description: 'C', quantity: 1, unitPrice: 250000 }] });
    const res = (await call('GET', '/api/sales/summary?start=2026-12-01&end=2026-12-31', admin)).json.data;
    expect(res).toMatchObject({ billedTotal: 1750000, paidTotal: 1000000, unpaidTotal: 750000, count: 3 });
    const ota = res.bySource.find((s: any) => s.source === 'ota');
    expect(ota).toMatchObject({ billedTotal: 1500000, paidTotal: 1000000, count: 2 });
    const legacy = await call('GET', '/api/sales?start=2026-12-01&end=2026-12-31&pageSize=100', admin);
    expect(legacy.json.pagination.total).toBe(3);
    expect(Object.keys(legacy.json.data[0]).sort()).toEqual(['amount', 'date', 'description', 'id', 'invoiceId', 'source']);
  });

  it('the new endpoints keep their permission gates', async () => {
    const staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    expect((await call('GET', '/api/reports/revenue?start=2026-01-01&end=2026-01-31', staff)).status).toBe(403);
    expect((await call('GET', '/api/sales/summary', staff)).status).toBe(403);
    expect((await call('GET', '/api/reports/revenue?start=2026-02-01&end=2026-01-01', admin)).status).toBe(400);
    expect((await call('GET', '/api/reports/revenue', admin)).status).toBe(422);
  });
});

describe('date bounds are inclusive (invoices, sales, reports)', () => {
  it('invoices dated exactly on start and end are included; the day before and after are not', async () => {
    for (const d of ['2027-03-09', '2027-03-10', '2027-03-20', '2027-03-21']) {
      await make({ invoiceDate: d, guestName: `Bound ${d}`, items: [{ description: 'x', quantity: 1, unitPrice: 1000 }] });
    }
    const q = 'start=2027-03-10&end=2027-03-20';
    const list = await call('GET', `/api/invoices?${q}&pageSize=100`, admin);
    expect(list.json.data.map((i: any) => i.invoiceDate).sort()).toEqual(['2027-03-10', '2027-03-20']);
    const sales = await call('GET', `/api/sales?${q}&pageSize=100`, admin);
    expect(sales.json.data.map((s: any) => s.date).sort()).toEqual(['2027-03-10', '2027-03-20']);
    const summary = await call('GET', `/api/reports/summary?${q}`, admin);
    expect(summary.json.data.totalSales).toBe(2000);
    expect(summary.json.data.totalInvoices).toBe(2);
    const rev = await call('GET', `/api/reports/revenue?${q}`, admin);
    expect(rev.json.data.billedTotal).toBe(2000);
    const single = await call('GET', '/api/reports/summary?start=2027-03-10&end=2027-03-10', admin);
    expect(single.json.data.totalSales).toBe(1000);
  });
});

describe('BE-031: upper bounds on money and quantity', () => {
  const item = (over: Record<string, unknown>) => ({ description: 'x', quantity: 1, unitPrice: 1000, ...over });

  it('rejects absurd quantities, prices and coerced exponents with 422', async () => {
    for (const [label, it] of [
      ['unit price over cap', item({ unitPrice: 10_000_000_001 })],
      ['quantity over cap', item({ quantity: 10_001 })],
      ['exponent string', item({ unitPrice: '1e21' })],
      ['beyond safe integer', item({ unitPrice: 9_007_199_254_740_993 })],
      ['infinity', item({ unitPrice: 'Infinity' })],
    ] as const) {
      const res = await call('POST', '/api/invoices', admin, invoice({ items: [it] }));
      expect(res.status, label).toBe(422);
    }
  });

  it('rejects a subtotal over the invoice cap even when each line is within its own cap', async () => {
    const lines = [item({ quantity: 100, unitPrice: 10_000_000_000 }), item({ quantity: 100, unitPrice: 10_000_000_000 })];
    const res = await call('POST', '/api/invoices', admin, invoice({ items: lines }));
    expect(res.status).toBe(422);
    expect(res.json.message).toMatch(/batas/);
  });

  it('accepts values at the caps and the largest seeded values', async () => {
    const edge = await call('POST', '/api/invoices', admin, invoice({ items: [item({ quantity: 100, unitPrice: 10_000_000_000 })] }));
    expect(edge.status).toBe(201);
    expect(edge.json.data.total).toBe(1_000_000_000_000);
    // The per-line caps themselves (10.000 x Rp10 miliar) are valid on their own but exceed the invoice cap.
    const lineCaps = await call('POST', '/api/invoices', admin, invoice({ items: [item({ quantity: 10_000, unitPrice: 10_000_000_000 })] }));
    expect(lineCaps.status).toBe(422);
    const seedLike = await call('POST', '/api/invoices', admin, invoice({ items: [item({ quantity: 28, unitPrice: 1_200_000 })] }));
    expect(seedLike.status).toBe(201);
  });

  it('expense amount and reservation rates/DP are bounded too', async () => {
    const base = { date: '2026-09-19', category: 'Other', description: 'big' };
    expect((await call('POST', '/api/expenses', admin, { ...base, amount: 10_000_000_001 })).status).toBe(422);
    expect((await call('POST', '/api/expenses', admin, { ...base, amount: 10_000_000_000 })).status).toBe(201);
    const stay = (rate: number, dpFixed?: number) => ({
      guestName: 'Cap Guest', source: 'direct', checkInDate: '2027-05-01', checkOutDate: '2027-05-02', notes: '',
      rooms: [{ roomId: 'room-01', roomNumber: 'x' }],
      pricing: {
        mode: 'same', nightlyRates: [{ date: '2027-05-01', rate }],
        paymentType: dpFixed === undefined ? 'no_dp' : 'dp', dpType: dpFixed === undefined ? 'percentage' : 'fixed',
        ...(dpFixed === undefined ? {} : { dpFixedAmount: dpFixed }),
      },
    });
    expect((await call('POST', '/api/reservations', admin, stay(10_000_000_001))).status).toBe(422);
    expect((await call('POST', '/api/reservations', admin, stay(1_000_000, 10_000_000_001))).status).toBe(422);
    expect((await call('POST', '/api/reservations', admin, stay(1_000_000))).status).toBe(201);
  });
});
