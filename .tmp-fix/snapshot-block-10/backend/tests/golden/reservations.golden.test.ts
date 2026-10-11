import { afterEach, describe, it, expect } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

function stay(over: Record<string, unknown> = {}) {
  return {
    guestName: 'Golden Guest',
    source: 'phone',
    checkInDate: '2026-11-10',
    checkOutDate: '2026-11-12',
    notes: 'golden',
    rooms: [{ roomId: 'room-05', roomNumber: '05', roomTypeName: 'Family' }],
    pricing: {
      mode: 'different',
      nightlyRates: [
        { date: '2026-11-10', rate: 600000 },
        { date: '2026-11-11', rate: 700000 },
      ],
      paymentType: 'dp',
      dpType: 'percentage',
      dpPercentage: 25,
    },
    ...over,
  };
}

describe('golden: reservations (current happy paths)', () => {
  it('list, filters, get, calendar, availability', async () => {
    const { rec, staff } = await startGolden();
    await rec.call('list page 1 size 100', 'GET', '/api/reservations?page=1&pageSize=100', staff);
    await rec.call('list default paging', 'GET', '/api/reservations', staff);
    await rec.call('list page 2 size 5', 'GET', '/api/reservations?page=2&pageSize=5', staff);
    await rec.call('filter status', 'GET', '/api/reservations?status=reserved&pageSize=100', staff);
    await rec.call('filter source', 'GET', '/api/reservations?source=ota', staff);
    await rec.call('filter date', 'GET', '/api/reservations?date=2026-09-16', staff);
    await rec.call('search code', 'GET', '/api/reservations?search=RSV-2026-002', staff);
    await rec.call('get', 'GET', '/api/reservations/res-002', staff);
    await rec.call('get 404', 'GET', '/api/reservations/nope', staff);
    await rec.call('calendar', 'GET', '/api/reservations/calendar?from=2026-09-01&to=2026-10-01', staff);
    await rec.call('calendar filtered', 'GET', '/api/reservations/calendar?from=2026-09-01&to=2026-10-01&status=checked-in', staff);
    await rec.call('calendar bad range', 'GET', '/api/reservations/calendar?from=2026-10-01&to=2026-09-01', staff);
    await rec.call('availability', 'GET', '/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-18', staff);
    await rec.call('availability exclude', 'GET', '/api/reservations/availability?checkIn=2026-09-16&checkOut=2026-09-18&excludeId=res-002', staff);
    await rec.call('availability bad range', 'GET', '/api/reservations/availability?checkIn=2026-09-18&checkOut=2026-09-16', staff);
    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/reservations-read.json');
  });

  it('create, edit (reserved), check-in, check-out, cancel', async () => {
    const { rec, admin, staff } = await startGolden();
    const created = await rec.call('create', 'POST', '/api/reservations', staff, stay());
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('create validation error', 'POST', '/api/reservations', staff, stay({ guestName: 'A' }));
    await rec.call('create overlapping same room (409)', 'POST', '/api/reservations', staff, stay({ guestName: 'Overlap Guest' }));
    await rec.call('edit guest + notes (full payload as the wizard sends)', 'PATCH', `/api/reservations/${id}`, staff, stay({ guestName: 'Golden Edited', notes: 'edited' }));
    await rec.call('edit pricing only', 'PATCH', `/api/reservations/${id}`, staff, {
      pricing: {
        mode: 'same',
        nightlyRates: [
          { date: '2026-11-10', rate: 500000 },
          { date: '2026-11-11', rate: 500000 },
        ],
        paymentType: 'no_dp',
        dpType: 'percentage',
      },
    });
    await rec.call('edit dates and room', 'PATCH', `/api/reservations/${id}`, staff, {
      checkInDate: '2026-11-20',
      checkOutDate: '2026-11-21',
      rooms: [{ roomId: 'room-06', roomNumber: '06', roomTypeName: 'Family' }],
      pricing: {
        mode: 'same',
        nightlyRates: [{ date: '2026-11-20', rate: 450000 }],
        paymentType: 'dp',
        dpType: 'fixed',
        dpFixedAmount: 100000,
      },
    });
    await rec.call('get after edits', 'GET', `/api/reservations/${id}`, staff);
    await rec.call('check-in', 'POST', `/api/reservations/${id}/check-in`, staff);
    await rec.call('check-in again (409)', 'POST', `/api/reservations/${id}/check-in`, staff);
    await rec.call('cancel after check-in (409)', 'POST', `/api/reservations/${id}/cancel`, admin);
    await rec.call('check-out', 'POST', `/api/reservations/${id}/check-out`, staff);
    await rec.call('check-out again (409)', 'POST', `/api/reservations/${id}/check-out`, staff);

    const second = await rec.call('create second', 'POST', '/api/reservations', staff, stay({
      guestName: 'Second Guest',
      rooms: [{ roomId: 'room-07', roomNumber: '07', roomTypeName: 'Standard' }],
    }));
    const id2 = second.json.data.id as string;
    await rec.call('staff cannot cancel (403)', 'POST', `/api/reservations/${id2}/cancel`, staff);
    await rec.call('cancel', 'POST', `/api/reservations/${id2}/cancel`, admin);
    await rec.call('cancel again (409)', 'POST', `/api/reservations/${id2}/cancel`, admin);
    await rec.call('check-in unknown (404)', 'POST', '/api/reservations/nope/check-in', staff);
    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/reservations-write.json');
  });
});
