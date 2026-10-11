/**
 * Decorative bordered "LUNAS" watermark for the invoice print document.
 *
 * Presentation ONLY — it performs no payment math and receives no payment
 * state. Callers decide visibility (see `utils/invoicePayment.ts`), keeping the
 * business rule testable independently of how it looks.
 *
 * A single thin rectangular frame around one large word. Border and text live
 * on the SAME element, so the shared `transform` rotates them together as one
 * inked object and a single `opacity` keeps them visually coherent.
 *
 * No fill, no shadow, no glow, no gradient, no distress texture — it should
 * read as ink printed onto the document.
 *
 * `aria-hidden` because the invoice already states settlement in text
 * ("Payment Status" plus the Total Paid / Remaining rows). The watermark is a
 * visual confirmation, never the sole source of truth. Non-interactive and
 * static — no animation, hover state, or transition.
 */
export function LunasWatermark() {
  return (
    <div className="invoice-watermark" aria-hidden="true" data-testid="lunas-watermark">
      LUNAS
    </div>
  );
}

export default LunasWatermark;