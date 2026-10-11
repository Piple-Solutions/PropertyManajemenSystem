import { afterEach, describe, it, expect } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

describe('golden: dashboard, activities, audit side effects (current happy paths)', () => {
  it('dashboard overview and activities list/filter/detail', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('dashboard (admin)', 'GET', '/api/dashboard/overview', admin);
    await rec.call('dashboard (staff)', 'GET', '/api/dashboard/overview', staff);
    await rec.call('dashboard without token', 'GET', '/api/dashboard/overview');

    await rec.call('activities page 1 size 100', 'GET', '/api/activities?page=1&pageSize=100', admin);
    await rec.call('activities default paging', 'GET', '/api/activities', admin);
    await rec.call('activities category', 'GET', '/api/activities?category=finance&pageSize=100', admin);
    await rec.call('activities user', 'GET', '/api/activities?userId=user-001&pageSize=100', admin);
    await rec.call('activities search', 'GET', '/api/activities?search=Utilities', admin);
    await rec.call('activity detail', 'GET', '/api/activities/act-001', admin);
    await rec.call('activity 404', 'GET', '/api/activities/nope', admin);
    await rec.call('staff cannot view activities (403)', 'GET', '/api/activities', staff);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/dashboard-activities.json');
  });

  it('audit rows written by current mutations (what is audited today)', async () => {
    const { rec, admin, staff } = await startGolden();

    // Mutations that ARE audited today. Block 3 only ADDS rows for the others;
    // these rows must keep their exact shape.
    const created = await rec.call('create reservation', 'POST', '/api/reservations', staff, {
      guestName: 'Audit Golden',
      source: 'direct',
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-02',
      notes: '',
      rooms: [{ roomId: 'room-09', roomNumber: '09', roomTypeName: 'Twin' }],
      pricing: {
        mode: 'same',
        nightlyRates: [{ date: '2026-12-01', rate: 300000 }],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    });
    const id = created.json.data.id as string;
    await rec.call('check-in', 'POST', `/api/reservations/${id}/check-in`, staff);
    await rec.call('create room', 'POST', '/api/rooms', admin, { roomNumber: 'A-1', roomTypeId: 'room-type-001' });
    await rec.call('create expense', 'POST', '/api/expenses', admin, {
      date: '2026-09-19', category: 'Other', description: 'audit golden', amount: 1000,
    });
    await rec.call('create invoice', 'POST', '/api/invoices', admin, {
      guestName: 'Audit Invoice', source: 'direct', invoiceDate: '2026-09-19',
      items: [{ description: 'x', quantity: 1, unitPrice: 1000 }],
    });
    await rec.call('activities newest first', 'GET', '/api/activities?page=1&pageSize=8', admin);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/audit-rows.json');
  });
});
