import type { ReservationPricingState } from '@/types/pricing.types';
import type { ApiReservation } from './reservationService';

/**
 * Pricing adapter: pricing/payment state now arrives embedded in the
 * reservation API response, so there is no separate pricing store.
 * This module keeps the `getState` name used by the detail page and the
 * wizard utils, deriving editable UI state from the API object.
 */
class ReservationPricingService {
  /** Editable UI state (adds sameRate derived from nightly rates for Same mode). */
  stateFromReservation(
    reservation: ApiReservation,
    fallback: { checkInDate: string; checkOutDate: string; referenceRate: number; rateSource: string },
  ): ReservationPricingState {
    void fallback;
    const nightlyRates = (reservation.pricing?.nightlyRates ?? []).map((n) => ({ ...n }));
    const payment = reservation.payment ?? { type: 'no_dp' as const, dpType: 'percentage' as const };
    return {
      mode: reservation.pricing?.mode ?? 'same',
      sameRate: nightlyRates.length > 0 ? nightlyRates[0].rate : 0,
      nightlyRates,
      paymentType: payment.type,
      dpType: payment.dpType ?? 'percentage',
      dpPercentage: payment.dpPercentage ?? 30,
      dpFixedAmount: payment.dpFixedAmount ?? 0,
    };
  }

  getState(
    reservation: ApiReservation,
    fallback: { checkInDate: string; checkOutDate: string; referenceRate: number; rateSource: string },
  ): ReservationPricingState {
    return this.stateFromReservation(reservation, fallback);
  }
}

export const reservationPricingService = new ReservationPricingService();
export default reservationPricingService;
