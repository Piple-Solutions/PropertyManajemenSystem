import type {
  NightlyRate,
  PricingCalculation,
  PricingValidation,
  ReservationPricingState,
} from '@/types/pricing.types';

/** Enumerate nights: check-in inclusive, check-out exclusive. Returns YYYY-MM-DD list. */
export function enumerateNights(checkInDate: string, checkOutDate: string): string[] {
  if (!checkInDate || !checkOutDate) return [];
  const ci = new Date(`${checkInDate}T00:00:00`);
  const co = new Date(`${checkOutDate}T00:00:00`);
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return [];
  if (co <= ci) return [];
  const nights: string[] = [];
  const cursor = new Date(ci);
  // Guard against absurd ranges (max 60 nights for admin UI sanity)
  let guard = 0;
  while (cursor < co && guard < 60) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    nights.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return nights;
}

export function formatIDR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(safe);
}

/** "Rp450.000" / "450000" / "450,000" -> 450000. Returns NaN when unparseable. */
export function parseRupiahInput(raw: string): number {
  if (typeof raw !== 'string') return NaN;
  const digitsOnly = raw.replace(/[^0-9]/g, '');
  if (digitsOnly === '') return NaN;
  return Number(digitsOnly);
}

export function calculateRoomTotal(nightlyRates: NightlyRate[]): number {
  return nightlyRates.reduce((sum, n) => sum + (Number.isFinite(n.rate) ? n.rate : 0), 0);
}

export function calculateDpAmount(roomTotal: number, pricing: Pick<ReservationPricingState, 'paymentType' | 'dpType' | 'dpPercentage' | 'dpFixedAmount'>): number {
  if (pricing.paymentType !== 'dp') return 0;
  if (roomTotal <= 0) return 0;
  if (pricing.dpType === 'percentage') {
    const pct = Number(pricing.dpPercentage);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    const clamped = Math.min(100, Math.max(0, pct));
    return Math.round((roomTotal * clamped) / 100);
  }
  const fixed = Number(pricing.dpFixedAmount);
  if (!Number.isFinite(fixed) || fixed <= 0) return 0;
  return Math.min(Math.round(fixed), roomTotal);
}

export function calculateRemaining(roomTotal: number, dpAmount: number): number {
  return Math.max(0, roomTotal - dpAmount);
}

export function calculatePricing(pricing: ReservationPricingState): PricingCalculation {
  const nightDates = pricing.nightlyRates.map((n) => n.date);
  const roomTotal = calculateRoomTotal(pricing.nightlyRates);
  const dpAmount = calculateDpAmount(roomTotal, pricing);
  return {
    nights: pricing.nightlyRates.length,
    nightDates,
    roomTotal,
    dpAmount,
    remainingBalance: calculateRemaining(roomTotal, dpAmount),
  };
}

export function validatePricing(pricing: ReservationPricingState): PricingValidation {
  const nightlyErrors: Record<string, string> = {};
  let sameRateError: string | undefined;
  let dpPercentageError: string | undefined;
  let dpFixedError: string | undefined;

  if (pricing.mode === 'same') {
    if (!Number.isFinite(pricing.sameRate) || pricing.sameRate < 0) {
      sameRateError = 'Actual rate must be a valid non-negative amount.';
    }
  }

  for (const night of pricing.nightlyRates) {
    if (!Number.isFinite(night.rate) || night.rate < 0) {
      nightlyErrors[night.date] = 'Rate must be >= Rp0.';
    }
  }

  const roomTotal = calculateRoomTotal(pricing.nightlyRates);

  if (pricing.paymentType === 'dp') {
    if (pricing.dpType === 'percentage') {
      const pct = Number(pricing.dpPercentage);
      if (!Number.isFinite(pct)) {
        dpPercentageError = 'DP percentage must be numeric.';
      } else if (pct < 0 || pct > 100) {
        dpPercentageError = 'DP percentage must be between 0 and 100.';
      }
    } else {
      const fixed = Number(pricing.dpFixedAmount);
      if (!Number.isFinite(fixed)) {
        dpFixedError = 'DP amount must be numeric.';
      } else if (fixed < 0) {
        dpFixedError = 'DP amount must be >= Rp0.';
      } else if (fixed > roomTotal) {
        dpFixedError = 'DP amount cannot exceed the reservation total.';
      }
    }
  }

  return {
    nightlyErrors,
    sameRateError,
    dpPercentageError,
    dpFixedError,
    isValid:
      Object.keys(nightlyErrors).length === 0 &&
      !sameRateError &&
      !dpPercentageError &&
      !dpFixedError,
  };
}

/** Build nightly rates for a date list, preserving existing edits by date. */
export function buildNightlyRates(
  dates: string[],
  fallbackRate: number,
  existing: NightlyRate[] = [],
): NightlyRate[] {
  const byDate = new Map(existing.map((n) => [n.date, n.rate]));
  return dates.map((date) => ({
    date,
    rate: byDate.has(date) ? Number(byDate.get(date)) : Math.max(0, Math.round(fallbackRate) || 0),
  }));
}

/** Apply one rate to all nights (used by both Same mode and "Apply to all" in Different mode). */
export function applyRateToAllNights(dates: string[], rate: number): NightlyRate[] {
  const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
  return dates.map((date) => ({ date, rate: safe }));
}

export function formatNightLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatNightLong(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
