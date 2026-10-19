import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { invoiceService } from '@/services/invoiceService';
import { reservationService } from '@/services/reservationService';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import { Card } from '@/components/shared/Card';
import { InvoiceForm } from '@/components/shared/InvoiceForm';
import { ErrorState } from '@/components/shared/ErrorState';
import { Loading } from '@/components/shared/Loading';
import { apiErrorMessage } from '@/services/api';
import type { Invoice } from '@/types/auth.types';
import { todayLocalISO } from '@/utils/localDate';
import '../../styles/finance-responsive.css';

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const [reservationId, setReservationId] = useState('');
  const [reservationCode, setReservationCode] = useState('');
  const [initialSource, setInitialSource] = useState('');
  const [initialGuest, setInitialGuest] = useState('');
  const [initialItems, setInitialItems] = useState<any[]>([]);
  const [initialTotal, setInitialTotal] = useState(0);
  // FE-001: the invoice (edit) and the next free number (create) now come from
  // the API. The form reads its default values once, so it is rendered only
  // after they have arrived.
  const [editInvoice, setEditInvoice] = useState<Invoice | undefined>(undefined);
  const [nextNumber, setNextNumber] = useState('');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isEdit && id) {
      let cancelled = false;
      setReady(false);
      setLoadError(null);
      invoiceService.getById(id).then((invoice) => {
        if (cancelled) return;
        setEditInvoice(invoice);
        if (invoice) {
          setReservationId(invoice.reservationId || '');
          setInitialSource(invoice.source);
          setInitialGuest(invoice.guestName);
          setInitialItems(invoice.items.map((item: any) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal })));
          setInitialTotal(invoice.total);
        }
        setReady(true);
      }).catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, ''));
      });
      return () => {
        cancelled = true;
      };
    } else if (!isEdit && !id) {
      let cancelled = false;
      setReady(false);
      // The server allocates the number; a failed preview (e.g. no permission)
      // falls back to a placeholder the server replaces if it is taken.
      invoiceService.getNextNumber(todayLocalISO()).then((n) => {
        if (!cancelled) setNextNumber(n);
      }).catch(() => {
        if (!cancelled) setNextNumber(`INV-${new Date().getFullYear()}-001`);
      }).finally(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    } else if (!isEdit && id) {
      let cancelled = false;
      reservationService.getFullById(id).then((reservation) => {
        if (cancelled || !reservation) return;
        setReservationId(reservation.id);
        setReservationCode(reservation.reservationCode);
        setInitialSource(reservation.source);
        setInitialGuest(reservation.guestName);
        const rooms = reservation.rooms ?? [];
        const items = rooms.map((room) => ({
          description: `${room.roomNumber} - ${room.roomTypeName}`,
          quantity: 1,
          unitPrice: room.rate,
          subtotal: room.subtotal,
        }));
        setInitialItems(items);
        setInitialTotal(reservation.totalAmount);
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [isEdit, id, reloadKey]);

  const defaultValues = (isEdit && id) ? {
    invoiceNumber: editInvoice?.invoiceNumber || '',
    reservationId,
    guestName: initialGuest,
    source: initialSource,
    invoiceDate: editInvoice?.invoiceDate || todayLocalISO(),
    items: initialItems.length > 0 ? initialItems : [{ description: '', quantity: 1, unitPrice: 0 }],
    discount: editInvoice?.discount || 0,
    invoiceStatus: (editInvoice?.invoiceStatus || 'Draft') as 'Draft' | 'Completed',
    paymentStatus: (editInvoice?.paymentStatus || 'Pending') as 'Pending' | 'Paid' | 'Overdue' | 'Partial',
  } : {
    invoiceNumber: nextNumber,
    reservationId,
    guestName: initialGuest,
    source: initialSource,
    invoiceDate: todayLocalISO(),
    items: initialItems.length > 0 ? initialItems : [{ description: '', quantity: 1, unitPrice: 0 }],
    discount: 0,
    invoiceStatus: 'Draft' as const,
    paymentStatus: 'Pending' as const,
  };

  return (
    <div className="fin-page" style={{ maxWidth: '900px' }}>
      <div className="fin-head" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/dashboard/finance/invoices" style={{ color: '#97764D', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>← Back</Link>
          <h1 className="fin-h1" style={{ marginBottom: 0 }}>
            {isEdit ? 'Edit Invoice' : (id ? 'Invoice from Reservation' : 'Create Invoice')}
          </h1>
        </div>
        {id && !isEdit && (
          <Link to={`/dashboard/reservations/${id}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', backgroundColor: '#FFFFFF', color: '#232D36', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: '1px solid #C7BBAB', textDecoration: 'none', cursor: 'pointer' }}>
            View Reservation →
          </Link>
        )}
      </div>
      {id && !isEdit && reservationId && (
        <Card style={{ marginBottom: '16px', backgroundColor: '#F2F0EB' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px', color: '#232D36' }}>
            <span><strong>Reservation:</strong> {reservationCode || id}</span>
            <span><strong>Guest:</strong> {initialGuest}</span>
            <span><strong>Source:</strong> {reservationSourceLabels[initialSource] || initialSource}</span>
            <span><strong>Total:</strong> {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(initialTotal)}</span>
          </div>
        </Card>
      )}
      {loadError !== null && <ErrorState description={loadError || undefined} onRetry={() => setReloadKey((k) => k + 1)} />}
      {saveError !== null && <ErrorState description={saveError || undefined} />}
      {loadError === null && !ready && <Loading />}
      {loadError === null && ready && (
      <InvoiceForm
        onSubmit={async (data) => {
          // Totals are computed by the server; only the editable fields are sent.
          const payload = {
            invoiceNumber: data.invoiceNumber,
            reservationId: data.reservationId || (isEdit ? undefined : reservationId || undefined),
            guestName: data.guestName,
            source: data.source,
            invoiceDate: data.invoiceDate,
            items: data.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            discount: data.discount,
            paymentStatus: data.paymentStatus,
            invoiceStatus: data.invoiceStatus,
          };
          setSaveError(null);
          try {
            if (isEdit && id) {
              await invoiceService.update(id, payload);
            } else {
              await invoiceService.create(payload);
            }
          } catch (err) {
            setSaveError(apiErrorMessage(err, ''));
            return;
          }
          navigate('/dashboard/finance/invoices');
        }}
        onCancel={() => navigate('/dashboard/finance/invoices')}
        initialData={defaultValues}
      />
      )}
    </div>
  );
}
