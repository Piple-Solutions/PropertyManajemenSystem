import type { ReservationPricingState } from './pricing.types';
import { DEFAULT_PRICING_STATE } from './pricing.types';
import { enumerateNights } from '@/utils/pricingUtils';

export type WizardStep = 0 | 1 | 2;

export const WIZARD_STEPS = [
  { key: 0, label: 'Guest & Date', short: 'Guest' },
  { key: 1, label: 'Room', short: 'Room' },
  { key: 2, label: 'Payment & Pricing', short: 'Payment' },
] as const;

/**
 * Single shared reservation draft for the 3-step wizard.
 * Frontend-only; structured so it can later be POSTed to Laravel
 * via `toReservationApiPayload` without rebuilding the UI.
 */
export interface ReservationDraft {
  guestName: string;
  notes: string;
  /** Rate source (existing PMS `source` field, edited in Step 3). */
  source: string;
  checkInDate: string;
  checkOutDate: string;
  roomIds: string[];
  pricing: ReservationPricingState;
}

export function createEmptyDraft(): ReservationDraft {
  return {
    guestName: '',
    notes: '',
    source: '',
    checkInDate: '',
    checkOutDate: '',
    roomIds: [],
    pricing: { ...DEFAULT_PRICING_STATE, nightlyRates: [] },
  };
}

export interface Step1Errors {
  guestName?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

export function validateStep1(draft: ReservationDraft): Step1Errors {
  const errors: Step1Errors = {};
  if (!draft.guestName || draft.guestName.trim().length < 2) {
    errors.guestName = 'Guest name must be at least 2 characters.';
  }
  if (!draft.checkInDate) errors.checkInDate = 'Check-in date is required.';
  if (!draft.checkOutDate) errors.checkOutDate = 'Check-out date is required.';
  if (draft.checkInDate && draft.checkOutDate) {
    const ci = new Date(`${draft.checkInDate}T00:00:00`);
    const co = new Date(`${draft.checkOutDate}T00:00:00`);
    if (!Number.isNaN(ci.getTime()) && !Number.isNaN(co.getTime()) && co <= ci) {
      errors.checkOutDate = 'Check-out must be after check-in.';
    }
  }
  if (draft.notes && draft.notes.length > 1000) {
    (errors as Record<string, string>).notes = 'Notes must be at most 1000 characters.';
  }
  return errors;
}

export function validateStep2(draft: ReservationDraft): { roomIds?: string } {
  if (!draft.roomIds || draft.roomIds.length === 0) {
    return { roomIds: 'Select at least one room to continue.' };
  }
  return {};
}

/** Meaningful data entered/modified vs the initial snapshot → double-confirm required. */
export function isDraftDirty(current: ReservationDraft, initial: ReservationDraft): boolean {
  if (current.guestName.trim() !== (initial.guestName || '').trim()) return true;
  if ((current.notes || '') !== (initial.notes || '')) return true;
  if (current.source !== initial.source) return true;
  if (current.checkInDate !== initial.checkInDate) return true;
  if (current.checkOutDate !== initial.checkOutDate) return true;
  const a = [...current.roomIds].sort().join(',');
  const b = [...initial.roomIds].sort().join(',');
  if (a !== b) return true;
  const pa = current.pricing;
  const pb = initial.pricing;
  if (pa.mode !== pb.mode) return true;
  if (pa.paymentType !== pb.paymentType) return true;
  if (pa.dpType !== pb.dpType) return true;
  if (Number(pa.sameRate) !== Number(pb.sameRate)) return true;
  if (Number(pa.dpPercentage) !== Number(pb.dpPercentage)) return true;
  if (Number(pa.dpFixedAmount) !== Number(pb.dpFixedAmount)) return true;
  const na = pa.nightlyRates.map((n) => `${n.date}:${n.rate}`).join(',');
  const nb = pb.nightlyRates.map((n) => `${n.date}:${n.rate}`).join(',');
  if (na !== nb) return true;
  return false;
}

export function countNights(checkInDate: string, checkOutDate: string): number {
  return enumerateNights(checkInDate, checkOutDate).length;
}

/** Future Laravel payload (conceptual). Frontend-only for now. */
export function toReservationApiPayload(draft: ReservationDraft) {
  return {
    guest: { name: draft.guestName.trim(), notes: draft.notes },
    stay: { checkIn: draft.checkInDate, checkOut: draft.checkOutDate },
    room: { roomIds: [...draft.roomIds] },
    pricing: {
      rateSource: draft.source,
      mode: draft.pricing.mode,
      nightlyRates: draft.pricing.nightlyRates.map((n) => ({ date: n.date, rate: Math.round(n.rate) })),
    },
    payment:
      draft.pricing.paymentType === 'no_dp'
        ? { type: 'no_dp' as const }
        : draft.pricing.dpType === 'percentage'
          ? { type: 'dp' as const, dpType: 'percentage' as const, dpPercentage: Number(draft.pricing.dpPercentage) }
          : { type: 'dp' as const, dpType: 'fixed' as const, dpFixedAmount: Math.round(Number(draft.pricing.dpFixedAmount)) },
  };
}
