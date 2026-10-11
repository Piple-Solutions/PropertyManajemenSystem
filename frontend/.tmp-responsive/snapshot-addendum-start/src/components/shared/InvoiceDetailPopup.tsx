import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { reservationService, type ApiReservation } from '@/services/reservationService';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import { invoiceStatusLabels, paymentStatusLabels } from '@/constants/invoiceStatuses';
import type { Invoice } from '@/types/auth.types';

interface InvoiceDetailPopupProps {
  invoice: Invoice | null;
  onClose: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

export function InvoiceDetailPopup({ invoice, onClose, onEdit, onDelete }: InvoiceDetailPopupProps) {
  const [linked, setLinked] = useState<ApiReservation | null>(null);

  useEffect(() => {
    if (!invoice?.reservationId) {
      setLinked(null);
      return;
    }
    let cancelled = false;
    reservationService.getFullById(invoice.reservationId).then((r) => {
      if (!cancelled) setLinked(r ?? null);
    }).catch(() => {
      if (!cancelled) setLinked(null);
    });
    return () => {
      cancelled = true;
    };
  }, [invoice]);

  const reservation = linked ?? undefined;
  const reservationRooms = linked?.rooms ?? [];

  return (
    <Modal
      open={invoice !== null}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'}
      titleAddon={invoice ? (
        <Badge variant={invoice.invoiceStatus === 'Completed' ? 'success' : invoice.invoiceStatus === 'Cancelled' ? 'danger' : invoice.invoiceStatus === 'Sent' ? 'info' : 'default'}>
          {invoiceStatusLabels[invoice.invoiceStatus] || invoice.invoiceStatus}
        </Badge>
      ) : undefined}
      size="lg"
      footer={
        invoice ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Link
              to={`/dashboard/finance/invoices/${invoice.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', height: '44px', padding: '0 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: '1px solid #97764D', color: '#97764D', textDecoration: 'none', fontFamily: 'var(--font-family-sans)' }}
            >
              Open Full Page
            </Link>
            <button
              type="button"
              aria-label="Edit invoice"
              onClick={() => onEdit(invoice)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #2563EB', backgroundColor: '#2563EB', color: '#FFFFFF', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#000000'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563EB'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#2563EB'; }}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Delete invoice"
              onClick={() => onDelete(invoice)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #DC2626', backgroundColor: '#DC2626', color: '#FFFFFF', cursor: 'pointer', transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#000000'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#DC2626'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#DC2626'; }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ) : undefined
      }
    >
      {invoice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Guest</h4>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#232D36' }}>{invoice.guestName}</p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Reservation</h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>
                {reservation ? reservation.reservationCode : (invoice.reservationId || '—')}
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Source</h4>
              <Badge variant="default">{reservationSourceLabels[invoice.source] || invoice.source}</Badge>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Invoice Date</h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#232D36' }}>{invoice.invoiceDate}</p>
            </div>

            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Payment Status</h4>
              <Badge variant={invoice.paymentStatus === 'Paid' ? 'success' : invoice.paymentStatus === 'Overdue' ? 'danger' : invoice.paymentStatus === 'Partial' ? 'warning' : 'default'}>
                {paymentStatusLabels[invoice.paymentStatus] || invoice.paymentStatus}
              </Badge>
            </div>
          </div>

          {reservation && (
            <div style={{ backgroundColor: '#F2F0EB', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#232D36' }}>
              <strong>Linked reservation:</strong> {reservation.reservationCode} · {reservation.guestName} · {reservation.checkInDate} → {reservation.checkOutDate}
              {reservationRooms.length > 0 && (
                <span> · {reservationRooms.map((r) => `Room ${r.roomNumber} (${r.roomTypeName})`).join(', ')}</span>
              )}
            </div>
          )}

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Items</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {invoice.items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: '1px solid #C7BBAB', fontSize: '14px' }}>
                  <div>
                    <span style={{ color: '#232D36', fontWeight: 600 }}>{item.description}</span>
                    <span style={{ marginLeft: '12px', fontSize: '13px', color: '#6B7881' }}>× {item.quantity}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: '#232D36', whiteSpace: 'nowrap' }}>
                    Rp {(item.quantity * item.unitPrice).toLocaleString('id-ID')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '4px 0', fontSize: '14px', color: '#6B7881' }}>Subtotal: Rp {invoice.subtotal.toLocaleString('id-ID')}</p>
            <p style={{ margin: '4px 0', fontSize: '14px', color: '#6B7881' }}>Discount: {invoice.discount}% (Rp {(invoice.subtotal * invoice.discount / 100).toLocaleString('id-ID')})</p>
            <p style={{ margin: '4px 0', fontSize: '18px', fontWeight: 700, color: '#232D36' }}>Total: Rp {invoice.total.toLocaleString('id-ID')}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
