/**
 * Reservation pricing calculations — server-side mirror of
 * `frontend/src/utils/pricingUtils.ts`.
 *
 * The two implementations MUST stay in sync: derived values (nights,
 * roomTotal, dpAmount, remainingBalance) are never stored, they are
 * recomputed here on every read and write. Any formula change must be
 * applied in both places.
 */

export interface NightlyRateInput {
  date: string;
  rate: number;
}

export interface PricingTerms {
  paymentType: 'no_dp' | 'dp';
  dpType: 'percentage' | 'fixed';
  dpPercentage?: number | null;
  dpFixedAmount?: number | null;
}

export interface PricingCalculation {
  nights: number;
  nightDates: string[];
  roomTotal: number;
  dpAmount: number;
  remainingBalance: number;
}

export const MAX_NIGHTS = 60;

/** Nights from check-in (inclusive) to check-out (exclusive), `YYYY-MM-DD`. */
export function enumerateNights(checkInDate: string, checkOutDate: string): string[] {
  if (!checkInDate || !checkOutDate) return [];
  const ci = new Date(`${checkInDate}T00:00:00`);
  const co = new Date(`${checkOutDate}T00:00:00`);
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return [];
  if (co <= ci) return [];
  const dates: string[] = [];
  const cursor = new Date(ci);
  let guard = 0;
  while (cursor < co && guard < MAX_NIGHTS) {
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${cursor.getFullYear()}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

export function calculateRoomTotal(nightlyRates: NightlyRateInput[]): number {
  return nightlyRates.reduce((sum, n) => sum + (Number.isFinite(n.rate) ? n.rate : 0), 0);
}

export function calculateDpAmount(roomTotal: number, terms: PricingTerms): number {
  if (terms.paymentType !== 'dp') return 0;
  if (roomTotal <= 0) return 0;
  if (terms.dpType === 'percentage') {
    const pct = Number(terms.dpPercentage);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    const clamped = Math.min(100, Math.max(0, pct));
    return Math.round((roomTotal * clamped) / 100);
  }
  const fixed = Number(terms.dpFixedAmount);
  if (!Number.isFinite(fixed) || fixed <= 0) return 0;
  return Math.min(Math.round(fixed), roomTotal);
}

export function calculateRemaining(roomTotal: number, dpAmount: number): number {
  return Math.max(0, roomTotal - dpAmount);
}

export function calculatePricing(nightlyRates: NightlyRateInput[], terms: PricingTerms): PricingCalculation {
  const nightDates = nightlyRates.map((n) => n.date);
  const roomTotal = calculateRoomTotal(nightlyRates);
  const dpAmount = calculateDpAmount(roomTotal, terms);
  return {
    nights: nightlyRates.length,
    nightDates,
    roomTotal,
    dpAmount,
    remainingBalance: calculateRemaining(roomTotal, dpAmount),
  };
}

/**
 * Split a reservation total across rooms, mirroring
 * `frontend/src/utils/reservationDraft.ts` (`saveReservationDraft`):
 * `Math.round` per room, rounding remainder absorbed by the last room.
 * Returns per-room `{ rate, subtotal }` with `rate` = nightly average.
 */
export function splitRoomTotals(
  roomTotal: number,
  roomCount: number,
  nights: number,
): Array<{ rate: number; subtotal: number }> {
  const count = Math.max(1, roomCount);
  const out: Array<{ rate: number; subtotal: number }> = [];
  let assigned = 0;
  for (let i = 0; i < count; i += 1) {
    const subtotal = i === count - 1 ? roomTotal - assigned : Math.round(roomTotal / count);
    assigned += subtotal;
    out.push({ rate: nights > 0 ? Math.round(subtotal / nights) : subtotal, subtotal });
  }
  return out;
}

/** Next `RSV-YYYY-NNN` code. Year comes from the current date. */
export function nextReservationCode(existingCount: number): string {
  const year = new Date().getFullYear();
  return `RSV-${year}-${String(existingCount + 1).padStart(3, '0')}`;
}
