import { afterEach, describe, it, expect } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

const invoiceBody = (over: Record<string, unknown> = {}) => ({
  guestName: 'Golden Invoice Guest',
  source: 'direct',
  invoiceDate: '2026-09-18',
  items: [
    { description: 'Room 04 - 2 nights', quantity: 2, unitPrice: 600000 },
    { description: 'Breakfast', quantity: 4, unitPrice: 25000 },
  ],
  discount: 10,
  ...over,
});

describe('golden: finance (current happy paths)', () => {
  it('invoices: list, filters, create, patch, send, pay, cancel, delete draft', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list invoices', 'GET', '/api/invoices?page=1&pageSize=100', admin);
    await rec.call('list default paging', 'GET', '/api/invoices', admin);
    await rec.call('filter status', 'GET', '/api/invoices?status=Completed&pageSize=100', admin);
    await rec.call('filter payment', 'GET', '/api/invoices?payment=Pending&pageSize=100', admin);
    await rec.call('filter source + range', 'GET', '/api/invoices?source=direct&start=2026-09-01&end=2026-09-30&pageSize=100', admin);
    await rec.call('search', 'GET', '/api/invoices?search=INV-2026-001', admin);
    await rec.call('bad range', 'GET', '/api/invoices?start=2026-09-30&end=2026-09-01', admin);
    await rec.call('get', 'GET', '/api/invoices/inv-001', admin);
    await rec.call('get 404', 'GET', '/api/invoices/nope', admin);
    await rec.call('next number', 'GET', '/api/invoices/next-number?date=2026-09-18', admin);
    await rec.call('staff has no finance permission (403)', 'GET', '/api/invoices', staff);

    const created = await rec.call('create (server-allocated number)', 'POST', '/api/invoices', admin, invoiceBody());
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('create validation error', 'POST', '/api/invoices', admin, invoiceBody({ items: [] }));
    await rec.call('patch items + discount', 'PATCH', `/api/invoices/${id}`, admin, {
      items: [{ description: 'Room 04 - 1 night', quantity: 1, unitPrice: 600000 }],
      discount: 0,
    });
    await rec.call('send', 'POST', `/api/invoices/${id}/send`, admin);
    await rec.call('pay', 'POST', `/api/invoices/${id}/pay`, admin);
    await rec.call('cancel after paid (current behavior)', 'POST', `/api/invoices/${id}/cancel`, admin);

    const draft = await rec.call('create draft to delete', 'POST', '/api/invoices', admin, invoiceBody({ guestName: 'Draft To Delete' }));
    const draftId = draft.json.data.id as string;
    await rec.call('delete draft', 'DELETE', `/api/invoices/${draftId}`, admin);
    await rec.call('delete draft again 404', 'DELETE', `/api/invoices/${draftId}`, admin);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/invoices.json');
  });

  it('expenses: list, filters, create, patch, delete', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list expenses', 'GET', '/api/expenses?page=1&pageSize=100', admin);
    await rec.call('filter category', 'GET', '/api/expenses?category=Utilities&pageSize=100', admin);
    await rec.call('filter status + range', 'GET', '/api/expenses?status=Paid&start=2026-09-01&end=2026-09-30&pageSize=100', admin);
    await rec.call('search', 'GET', '/api/expenses?search=electric', admin);
    await rec.call('staff cannot list (403)', 'GET', '/api/expenses', staff);
    const created = await rec.call('create expense', 'POST', '/api/expenses', admin, {
      date: '2026-09-19', category: 'Supplies', description: 'Golden supplies', amount: 150000, status: 'Pending',
    });
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('create expense invalid', 'POST', '/api/expenses', admin, { date: 'x', category: 'Nope', description: '', amount: 0 });
    await rec.call('get expense', 'GET', `/api/expenses/${id}`, admin);
    await rec.call('patch expense', 'PATCH', `/api/expenses/${id}`, admin, { amount: 175000, status: 'Paid' });
    await rec.call('delete expense', 'DELETE', `/api/expenses/${id}`, admin);
    await rec.call('delete expense again 404', 'DELETE', `/api/expenses/${id}`, admin);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/expenses.json');
  });

  it('sales and reports', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('sales list', 'GET', '/api/sales?page=1&pageSize=100', admin);
    await rec.call('sales range + source', 'GET', '/api/sales?start=2026-09-01&end=2026-09-15&source=direct', admin);
    await rec.call('sales breakdown', 'GET', '/api/sales/breakdown?start=2026-09-01&end=2026-09-30', admin);
    await rec.call('sales breakdown all', 'GET', '/api/sales/breakdown', admin);
    await rec.call('report summary', 'GET', '/api/reports/summary?start=2026-09-01&end=2026-09-30', admin);
    await rec.call('report summary categories', 'GET', '/api/reports/summary?start=2026-09-01&end=2026-09-30&categories=Utilities,Staff', admin);
    await rec.call('report bad range', 'GET', '/api/reports/summary?start=2026-09-30&end=2026-09-01', admin);
    await rec.call('top invoices', 'GET', '/api/reports/top-invoices', admin);
    await rec.call('top invoices limit 3', 'GET', '/api/reports/top-invoices?limit=3', admin);
    await rec.call('staff cannot view sales (403)', 'GET', '/api/sales', staff);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/sales-reports.json');
  });
});
