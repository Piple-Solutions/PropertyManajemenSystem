import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateDpAmount,
  calculatePricing,
  calculateRemaining,
  calculateRoomTotal,
  enumerateNights,
  splitRoomTotals,
} from '../src/lib/pricing';
import { backendRoot } from './helpers/fake-d1';

describe('enumerateNights', () => {
  it('lists nights check-in inclusive, check-out exclusive', () => {
    expect(enumerateNights('2026-09-16', '2026-09-19')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
  });

  it('returns [] for empty, invalid, or reversed ranges', () => {
    expect(enumerateNights('', '2026-09-19')).toEqual([]);
    expect(enumerateNights('not-a-date', '2026-09-19')).toEqual([]);
    expect(enumerateNights('2026-09-19', '2026-09-16')).toEqual([]);
    expect(enumerateNights('2026-09-16', '2026-09-16')).toEqual([]);
  });

  it('caps at 60 nights', () => {
    expect(enumerateNights('2026-01-01', '2027-01-01')).toHaveLength(60);
  });
});

describe('pricing formulas (mirror frontend pricingUtils)', () => {
  it('sums room total, ignoring non-finite rates', () => {
    expect(calculateRoomTotal([{ date: 'd1', rate: 800000 }, { date: 'd2', rate: 800000 }])).toBe(1600000);
    expect(calculateRoomTotal([{ date: 'd1', rate: NaN }])).toBe(0);
  });

  it('no_dp and zero totals yield dp 0', () => {
    expect(calculateDpAmount(2400000, { paymentType: 'no_dp', dpType: 'percentage', dpPercentage: 30 })).toBe(0);
    expect(calculateDpAmount(0, { paymentType: 'dp', dpType: 'percentage', dpPercentage: 30 })).toBe(0);
  });

  it('percentage DP rounds and clamps to 100', () => {
    expect(calculateDpAmount(2400000, { paymentType: 'dp', dpType: 'percentage', dpPercentage: 30 })).toBe(720000);
    expect(calculateDpAmount(1000, { paymentType: 'dp', dpType: 'percentage', dpPercentage: 150 })).toBe(1000);
    expect(calculateDpAmount(1000, { paymentType: 'dp', dpType: 'percentage', dpPercentage: 0 })).toBe(0);
  });

  it('fixed DP caps at the total', () => {
    expect(calculateDpAmount(1500000, { paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 500000 })).toBe(500000);
    expect(calculateDpAmount(400000, { paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 500000 })).toBe(400000);
    expect(calculateDpAmount(400000, { paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 0 })).toBe(0);
  });

  it('remaining balance floors at 0', () => {
    expect(calculateRemaining(2400000, 720000)).toBe(1680000);
    expect(calculateRemaining(100, 200)).toBe(0);
  });

  it('computes the full calc for a percentage-DP stay (res-002)', () => {
    const calc = calculatePricing(
      [
        { date: '2026-09-16', rate: 800000 },
        { date: '2026-09-17', rate: 800000 },
        { date: '2026-09-18', rate: 800000 },
      ],
      { paymentType: 'dp', dpType: 'percentage', dpPercentage: 30 },
    );
    expect(calc).toEqual({
      nights: 3,
      nightDates: ['2026-09-16', '2026-09-17', '2026-09-18'],
      roomTotal: 2400000,
      dpAmount: 720000,
      remainingBalance: 1680000,
    });
  });

  it('computes the full calc for a fixed-DP stay (res-015)', () => {
    const calc = calculatePricing(
      [
        { date: '2026-10-02', rate: 1700000 },
        { date: '2026-10-03', rate: 1750000 },
        { date: '2026-10-04', rate: 1800000 },
      ],
      { paymentType: 'dp', dpType: 'fixed', dpFixedAmount: 500000 },
    );
    expect(calc.roomTotal).toBe(5250000);
    expect(calc.dpAmount).toBe(500000);
    expect(calc.remainingBalance).toBe(4750000);
  });
});

describe('splitRoomTotals (mirror saveReservationDraft)', () => {
  it('splits evenly with nightly-average rates', () => {
    expect(splitRoomTotals(2400000, 2, 3)).toEqual([
      { rate: 400000, subtotal: 1200000 },
      { rate: 400000, subtotal: 1200000 },
    ]);
  });

  it('absorbs the rounding remainder in the last room', () => {
    const splits = splitRoomTotals(100, 3, 1);
    expect(splits.map((s) => s.subtotal)).toEqual([33, 33, 34]);
    expect(splits.reduce((a, s) => a + s.subtotal, 0)).toBe(100);
  });

  it('uses subtotal as rate when nights is 0', () => {
    expect(splitRoomTotals(500, 1, 0)).toEqual([{ rate: 500, subtotal: 500 }]);
  });
});

describe('mock data consistency', () => {
  it('every seeded reservation total equals its nightly sum', () => {
    const reservations = JSON.parse(
      readFileSync(resolve(backendRoot, '..', 'frontend', 'src', 'data', 'mock', 'reservations.json'), 'utf8'),
    ) as Array<{ id: string; totalAmount: number }>;
    const pricing = JSON.parse(
      readFileSync(resolve(backendRoot, '..', 'frontend', 'src', 'data', 'mock', 'reservationPricing.json'), 'utf8'),
    ) as Array<{ reservationId: string; nightlyRates: Array<{ date: string; rate: number }> }>;
    for (const r of reservations) {
      const p = pricing.find((x) => x.reservationId === r.id);
      expect(p, `pricing row for ${r.id}`).toBeDefined();
      expect(calculateRoomTotal(p!.nightlyRates)).toBe(r.totalAmount);
    }
  });
});
