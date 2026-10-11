import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReservationPricingState } from '@/types/pricing.types';
import { DEFAULT_PRICING_STATE } from '@/types/pricing.types';
import {
  applyRateToAllNights,
  buildNightlyRates,
  calculatePricing,
  enumerateNights,
  validatePricing,
} from '@/utils/pricingUtils';

export interface UseReservationPricingOptions {
  checkInDate: string;
  checkOutDate: string;
  /** Reference/default rate (from room type). Used only as initial fallback, never as final price. */
  referenceRate: number;
  initial?: Partial<ReservationPricingState> | null;
}

export function useReservationPricing({
  checkInDate,
  checkOutDate,
  referenceRate,
  initial,
}: UseReservationPricingOptions) {
  const nightDates = useMemo(
    () => enumerateNights(checkInDate, checkOutDate),
    [checkInDate, checkOutDate],
  );

  const [pricing, setPricing] = useState<ReservationPricingState>(() => ({
    ...DEFAULT_PRICING_STATE,
    ...initial,
    nightlyRates: initial?.nightlyRates ? [...initial.nightlyRates] : [],
  }));

  const initializedRef = useRef(false);

  // Seed from initial only once per reservation identity (parent passes key)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (initial?.nightlyRates && initial.nightlyRates.length > 0) {
      setPricing((prev) => ({
        ...prev,
        ...initial,
        nightlyRates: [...(initial.nightlyRates || [])],
      }));
    }
  }, []);

  // Keep nightlyRates in sync with date range without losing per-date edits.
  // - New dates get fallback: sameRate (same mode) or referenceRate / first existing rate.
  // - Removed dates are dropped.
  // - Switching dates never resets payment term / DP values.
  useEffect(() => {
    setPricing((prev) => {
      const fallback =
        prev.mode === 'same' && prev.sameRate > 0
          ? prev.sameRate
          : prev.nightlyRates.length > 0
            ? prev.nightlyRates[0].rate
            : referenceRate > 0
              ? referenceRate
              : 0;
      const next = buildNightlyRates(nightDates, fallback, prev.nightlyRates);
      // Avoid infinite loops: shallow-compare
      const sameLength = next.length === prev.nightlyRates.length;
      const sameValues =
        sameLength &&
        next.every((n, i) => n.date === prev.nightlyRates[i]?.date && n.rate === prev.nightlyRates[i]?.rate);
      if (sameValues) return prev;
      return { ...prev, nightlyRates: next };
    });
  }, [nightDates, referenceRate]);

  const calc = useMemo(() => calculatePricing(pricing), [pricing]);
  const validation = useMemo(() => validatePricing(pricing), [pricing]);

  const setMode: (mode: 'same' | 'different') => void = (mode) => {
    setPricing((prev) => {
      if (prev.mode === mode) return prev;
      if (mode === 'same') {
        // Different -> Same: seed sameRate from first night (or reference) so nothing is lost unexpectedly.
        const seed =
          prev.nightlyRates.length > 0 ? prev.nightlyRates[0].rate : prev.sameRate || referenceRate || 0;
        return {
          ...prev,
          mode,
          sameRate: seed,
          nightlyRates: applyRateToAllNights(
            prev.nightlyRates.map((n) => n.date),
            seed,
          ),
        };
      }
      // Same -> Different: expose current per-night values for individual editing.
      return { ...prev, mode };
    });
  };

  const setSameRate = (rate: number) => {
    const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
    setPricing((prev) => ({
      ...prev,
      sameRate: safe,
      nightlyRates:
        prev.mode === 'same'
          ? applyRateToAllNights(
              prev.nightlyRates.map((n) => n.date),
              safe,
            )
          : prev.nightlyRates,
    }));
  };

  const setNightRate = (date: string, rate: number) => {
    const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
    setPricing((prev) => ({
      ...prev,
      nightlyRates: prev.nightlyRates.map((n) => (n.date === date ? { ...n, rate: safe } : n)),
    }));
  };

  const applyToAllNights = (rate: number) => {
    const safe = Number.isFinite(rate) && rate >= 0 ? Math.round(rate) : 0;
    setPricing((prev) => ({
      ...prev,
      nightlyRates: applyRateToAllNights(
        prev.nightlyRates.map((n) => n.date),
        safe,
      ),
    }));
  };

  const setPaymentType: (t: ReservationPricingState['paymentType']) => void = (paymentType) => {
    setPricing((prev) => ({ ...prev, paymentType }));
  };

  const setDpType: (t: ReservationPricingState['dpType']) => void = (dpType) => {
    setPricing((prev) => ({ ...prev, dpType }));
  };

  const setDpPercentage = (pct: number) => {
    setPricing((prev) => ({ ...prev, dpPercentage: Number.isFinite(pct) ? pct : 0 }));
  };

  const setDpFixedAmount = (amount: number) => {
    setPricing((prev) => ({
      ...prev,
      dpFixedAmount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0,
    }));
  };

  return {
    pricing,
    setPricing,
    nightDates,
    calc,
    validation,
    setMode,
    setSameRate,
    setNightRate,
    applyToAllNights,
    setPaymentType,
    setDpType,
    setDpPercentage,
    setDpFixedAmount,
  };
}

export type ReservationPricingController = ReturnType<typeof useReservationPricing>;
