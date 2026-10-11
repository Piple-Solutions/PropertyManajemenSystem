import type { Invoice } from '@/types/auth.types';

/**
 * Invoice settlement state.
 *
 * This is the single source of truth for "is this invoice LUNAS?", kept
 * deliberately separate from the stamp's visual component so the backend can
 * later feed either `payment_status = 'Paid'` or numeric `totalPaid` without
 * touching presentation.
 *
 * Amounts, not status, decide once they are available — so an invoice flagged
 * `Paid` that is still short by a rupiah does NOT render a LUNAS stamp.
 * `paymentStatus` is the fallback for records that carry no amounts.
 */
export interface InvoiceSettlement {
  /** Invoice total in whole rupiah. */
  total: number;
  /** Amount settled in whole rupiah. */
  paid: number;
  /** `total - paid`. Zero or negative means settled. */
  remaining: number;
  /** True only when nothing is outstanding on a non-cancelled invoice. */
  isFullyPaid: boolean;
  /** True when numeric amounts drove the decision, false when status was used. */
  fromAmounts: boolean;
}

/**
 * Rupiah is a whole-unit currency, so every comparison is done on integers.
 * Rounding defensively keeps a float artefact (e.g. 2499999.9999999998 from a
 * prorated discount) from either hiding a settled invoice or falsely settling
 * a one-rupih-short one.
 */
export function toRupiah(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Derive settlement for an invoice.
 *
 * Rules, in order:
 * 1. A cancelled/void invoice is never presented as paid, even if historical
 *    payment data says otherwise.
 * 2. If `totalPaid` is present, it is authoritative.
 * 3. Otherwise fall back to `paymentStatus`: only `'Paid'` implies settled.
 *
 * Overpayment settles the invoice (`remaining < 0` counts as paid); there is no
 * separate overpayment workflow.
 */
export function getInvoiceSettlement(invoice: Invoice): InvoiceSettlement {
  const total = toRupiah(invoice.total);
  const isCancelled = invoice.invoiceStatus === 'Cancelled';

  const fromAmounts = typeof invoice.totalPaid === 'number';
  const paid = fromAmounts
    ? toRupiah(invoice.totalPaid as number)
    : invoice.paymentStatus === 'Paid'
      ? total
      : 0;
  const remaining = toRupiah(total - paid);

  return {
    total,
    paid,
    remaining,
    isFullyPaid: !isCancelled && remaining <= 0,
    fromAmounts,
  };
}

/** Convenience predicate for `getInvoiceSettlement(invoice).isFullyPaid`. */
export function isInvoiceFullyPaid(invoice: Invoice): boolean {
  return getInvoiceSettlement(invoice).isFullyPaid;
}