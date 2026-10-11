/**
 * Dynamic Reservation Pricing & Payment Terms — frontend-only types.
 *
 * Hierarchy:
 *   nightlyRates -> roomTotal -> DP calculation -> remainingBalance
 *
 * All calculated values are DERIVED, never stored independently.
 * This shape is backend-ready for a future Laravel API payload
 * (see toPricingApiPayload in reservationPricingService).
 */

export type PricingMode = 'same' | 'different';

export type PaymentTermType = 'no_dp' | 'dp';

export type DpType = 'percentage' | 'fixed';

export interface NightlyRate {
  /** ISO date YYYY-MM-DD, one entry per night (check-in inclusive, check-out exclusive) */
  date: string;
  /** Actual admin-determined selling price for that night (IDR, integer >= 0) */
  rate: number;
}

export interface ReservationPricingState {
  mode: PricingMode;
  /** Used when mode === 'same'. Single admin rate applied to every night. */
  sameRate: number;
  /** One entry per night. Always the source of truth for totals. */
  nightlyRates: NightlyRate[];
  paymentType: PaymentTermType;
  dpType: DpType;
  /** 0 - 100, used when paymentType === 'dp' && dpType === 'percentage' */
  dpPercentage: number;
  /** IDR integer, used when paymentType === 'dp' && dpType === 'fixed' */
  dpFixedAmount: number;
}

/** Persisted / API-ready shape (no derived totals stored). */
export interface ReservationPricingPersisted {
  rateSource: string;
  mode: PricingMode;
  nightlyRates: NightlyRate[];
  paymentType: PaymentTermType;
  dpType: DpType;
  /** Only when dpType === 'percentage' */
  dpPercentage?: number;
  /** Only when dpType === 'fixed' */
  dpFixedAmount?: number;
}

export interface PricingCalculation {
  nights: number;
  nightDates: string[];
  roomTotal: number;
  dpAmount: number;
  remainingBalance: number;
}

export interface PricingValidation {
  nightlyErrors: Record<string, string>;
  sameRateError?: string;
  dpPercentageError?: string;
  dpFixedError?: string;
  isValid: boolean;
}

export const DEFAULT_PRICING_STATE: ReservationPricingState = {
  mode: 'same',
  sameRate: 0,
  nightlyRates: [],
  paymentType: 'no_dp',
  dpType: 'percentage',
  dpPercentage: 30,
  dpFixedAmount: 0,
};
