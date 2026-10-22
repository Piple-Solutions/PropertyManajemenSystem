import { useEffect, useState } from "react";
import { Facebook, Globe, Instagram, MessageCircle, Music2 } from "lucide-react";
import { reservationService, type ApiReservation } from "@/services/reservationService";
import { reservationSourceLabels } from "@/constants/reservationStatuses";
import { getInvoiceSettlement } from "@/utils/invoicePayment";
import { LunasWatermark } from "./LunasWatermark";
import logoBrown from "../../../assets/LogoBrown.png";
import type { Invoice } from "@/types/auth.types";

interface InvoicePrintDocumentProps {
  invoice: Invoice;
}

function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/**
 * Print-only A4 invoice document. Rendered inside `.invoice-print-area`
 * (hidden on screen, visible in print via invoice-print.css).
 * Uses actual invoice + linked reservation data only — no invented values.
 * Taxes/service charges have no source field in the Invoice model, so they
 * are intentionally omitted rather than fabricated.
 *
 * Template follows assets/InvoiceTemplate.pdf (visual reference only) with
 * the footer content from assets/FooterTextInvoice.txt. All data fields,
 * calculations and the LUNAS visibility condition are unchanged.
 */
export function InvoicePrintDocument({ invoice }: InvoicePrintDocumentProps) {
  const [linked, setLinked] = useState<ApiReservation | null>(null);

  useEffect(() => {
    if (!invoice.reservationId) {
      setLinked(null);
      return;
    }
    let cancelled = false;
    reservationService
      .getFullById(invoice.reservationId)
      .then((r) => {
        if (!cancelled) setLinked(r ?? null);
      })
      .catch(() => {
        if (!cancelled) setLinked(null);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice.reservationId]);

  const reservation = linked ?? undefined;
  const rooms = linked?.rooms ?? [];
  // Payment state is computed here (not inside the watermark) so presentation
  // and business logic stay separable.
  const settlement = getInvoiceSettlement(invoice);

  return (
    <div className="invoice-print">
      {/* Top-layer stamp. Absolutely positioned inside `.invoice-print`, so it
          contributes no flow height and cannot add a page. */}
      {settlement.isFullyPaid && <LunasWatermark />}

      {/* Sheet table: thead (masthead) and tfoot (footer) repeat at the
          top/bottom of every printed page, with space reserved in-flow so
          they never overlap content. */}
      <table className="invoice-print__sheet">
        <thead>
          <tr>
            <td>
              <header className="invoice-print__masthead">
                <div className="invoice-print__mastitle">INVOICE</div>
                <img src={logoBrown} alt="Homestay Joglo Seruni" className="invoice-print__logo" />
              </header>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="invoice-print__doctitle">Homestay Joglo Seruni Syariah</div>

              <section className="invoice-print__info" aria-label="Invoice information">
                <div className="invoice-print__infocol">
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Billed To</span>
                    <span className="invoice-print__infovalue">{invoice.guestName}</span>
                  </div>
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Invoice Date</span>
                    <span className="invoice-print__infovalue">{invoice.invoiceDate}</span>
                  </div>
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Source</span>
                    <span className="invoice-print__infovalue">
                      {reservationSourceLabels[invoice.source] || invoice.source}
                    </span>
                  </div>
                </div>
                <div className="invoice-print__infocol">
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Invoice Number</span>
                    <span className="invoice-print__infovalue">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Check In</span>
                    <span className="invoice-print__infovalue">
                      {reservation ? reservation.checkInDate : "—"}
                    </span>
                  </div>
                  <div className="invoice-print__inforow">
                    <span className="invoice-print__infolabel">Check Out</span>
                    <span className="invoice-print__infovalue">
                      {reservation ? reservation.checkOutDate : "—"}
                    </span>
                  </div>
                </div>
              </section>

              <div className="invoice-print__statusline">
                <span>
                  Payment Status: <strong>{invoice.paymentStatus}</strong>
                </span>
                <span>
                  Invoice Status: <strong>{invoice.invoiceStatus}</strong>
                </span>
              </div>

              {reservation && (
                <section className="invoice-print__reservation invoice-print__muted">
                  {reservation.reservationCode} · {reservation.guestName} ·{" "}
                  {reservation.checkInDate} → {reservation.checkOutDate}
                  {rooms.length > 0 && (
                    <>
                      {" "}
                      · {rooms.map((r) => `Room ${r.roomNumber} (${r.roomTypeName})`).join(", ")}
                    </>
                  )}
                </section>
              )}

              <section className="invoice-print__section">
                <h2 className="invoice-print__sectiontitle">Purchase Details</h2>
                <table className="invoice-print__table">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>No</th>
                      <th>Description</th>
                      <th style={{ textAlign: "right", width: "56px" }}>Qty</th>
                      <th style={{ textAlign: "right", width: "110px" }}>Unit Price</th>
                      <th style={{ textAlign: "right", width: "120px" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={item.id}>
                        <td>{i + 1}</td>
                        <td>{item.description}</td>
                        <td style={{ textAlign: "right" }}>{item.quantity}</td>
                        <td style={{ textAlign: "right" }}>{formatIDR(item.unitPrice)}</td>
                        <td style={{ textAlign: "right" }}>
                          {formatIDR(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Settlement is also stated in text below, so the watermark is never the
            only signal. */}
                <div className="invoice-print__totals">
                  <div className="invoice-print__trow">
                    <span>Subtotal</span>
                    <span>{formatIDR(invoice.subtotal)}</span>
                  </div>
                    <div className="invoice-print__trow">
                      <span>Discount</span>
                      <span>{invoice.discount}%</span>
                    </div>
                  <div className="invoice-print__trow invoice-print__trow--total">
                    <span>Total</span>
                    <span>{formatIDR(invoice.total)}</span>
                  </div>
                  <div className="invoice-print__trow">
                    <span>Total Paid</span>
                    <span>{formatIDR(settlement.paid)}</span>
                  </div>
                  <div className="invoice-print__trow">
                    <span>Remaining</span>
                    <span>{formatIDR(settlement.remaining)}</span>
                  </div>
                </div>
              </section>

              {reservation?.notes && reservation.notes.trim() && (
                <section className="invoice-print__notes">
                  <h2 className="invoice-print__sectiontitle">Notes</h2>
                  <div className="invoice-print__muted" style={{ whiteSpace: "pre-wrap" }}>
                    {reservation.notes}
                  </div>
                </section>
              )}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <footer className="invoice-print__footer">
                <div className="invoice-print__footbrand">Homestay Joglo Seruni</div>
                <div className="invoice-print__footline">
                  Gang Duren No.5, Dayu, Sinduharjo, Kec. Ngaglik, Kab. Sleman, Yogyakarta
                </div>
                <div className="invoice-print__footline">jogloseruni@gmail.com</div>
                <div className="invoice-print__footicons">
                  <div className="invoice-print__footicon">
                    <span className="invoice-print__footiconcircle">
                      <Globe size={15} color="#FFFFFF" aria-hidden="true" />
                    </span>
                    <span>jogloseruni.com</span>
                  </div>
                  <div className="invoice-print__footicon">
                    <span className="invoice-print__footiconcircle">
                      <MessageCircle size={15} color="#FFFFFF" aria-hidden="true" />
                    </span>
                    <span>+62-882-0085-68220</span>
                  </div>
                  <div className="invoice-print__footicon">
                    <span className="invoice-print__footiconcircle">
                      <Instagram size={15} color="#FFFFFF" aria-hidden="true" />
                    </span>
                    <span>@jogloseruni</span>
                  </div>
                  <div className="invoice-print__footicon">
                    <span className="invoice-print__footiconcircle">
                      <Music2 size={15} color="#FFFFFF" aria-hidden="true" />
                    </span>
                    <span>@joglo.seruni</span>
                  </div>
                  <div className="invoice-print__footicon">
                    <span className="invoice-print__footiconcircle">
                      <Facebook size={15} color="#FFFFFF" aria-hidden="true" />
                    </span>
                    <span>Joglo Seruni</span>
                  </div>
                </div>
              </footer>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
