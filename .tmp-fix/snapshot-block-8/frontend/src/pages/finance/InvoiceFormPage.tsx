import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { invoiceService } from '@/services/invoiceService';
import { reservationService } from '@/services/reservationService';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import { Card } from '@/components/shared/Card';
import { InvoiceForm } from '@/components/shared/InvoiceForm';
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

  useEffect(() => {
    if (isEdit && id) {
      const invoice = invoiceService.getById(id);
      if (invoice) {
        setReservationId(invoice.reservationId || '');
        setInitialSource(invoice.source);
        setInitialGuest(invoice.guestName);
        setInitialItems(invoice.items.map((item: any) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal })));
        setInitialTotal(invoice.total);
      }
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
  }, [isEdit, id]);

  const defaultValues = (isEdit && id) ? {
    invoiceNumber: invoiceService.getById(id)?.invoiceNumber || '',
    reservationId,
    guestName: initialGuest,
    source: initialSource,
    invoiceDate: invoiceService.getById(id)?.invoiceDate || new Date().toISOString().split('T')[0],
    items: initialItems.length > 0 ? initialItems : [{ description: '', quantity: 1, unitPrice: 0 }],
    discount: invoiceService.getById(id)?.discount || 0,
    invoiceStatus: (invoiceService.getById(id)?.invoiceStatus || 'Draft') as 'Draft' | 'Completed',
    paymentStatus: (invoiceService.getById(id)?.paymentStatus || 'Pending') as 'Pending' | 'Paid' | 'Overdue' | 'Partial',
  } : {
    invoiceNumber: `INV-2026-${String(invoiceService.getAll().length + 1).padStart(3, '0')}`,
    reservationId,
    guestName: initialGuest,
    source: initialSource,
    invoiceDate: new Date().toISOString().split('T')[0],
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
      <InvoiceForm
        onSubmit={(data) => {
          const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          if (isEdit && id) {
            const existing = invoiceService.getById(id);
            invoiceService.update(id, {
              invoiceNumber: data.invoiceNumber,
              reservationId: data.reservationId || undefined,
              guestName: data.guestName,
              source: data.source,
              invoiceDate: data.invoiceDate,
              items: data.items.map((item, index) => ({
                id: existing?.items[index]?.id || `inv-item-${Date.now()}-${index}`,
                invoiceId: id,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.quantity * item.unitPrice,
              })),
              subtotal,
              discount: data.discount,
              total: subtotal - (subtotal * data.discount / 100),
              paymentStatus: data.paymentStatus,
              invoiceStatus: data.invoiceStatus,
            });
          } else {
            invoiceService.create({
              invoiceNumber: data.invoiceNumber,
              reservationId: data.reservationId || reservationId || undefined,
              guestName: data.guestName,
              source: data.source,
              invoiceDate: data.invoiceDate,
              items: data.items.map((item, index) => ({
                id: `inv-item-${Date.now()}-${index}`,
                invoiceId: '',
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.quantity * item.unitPrice,
              })),
              subtotal,
              discount: data.discount,
              total: subtotal - (subtotal * data.discount / 100),
              paymentStatus: data.paymentStatus,
              invoiceStatus: data.invoiceStatus,
            });
          }
          navigate('/dashboard/finance/invoices');
        }}
        onCancel={() => navigate('/dashboard/finance/invoices')}
        initialData={defaultValues}
      />
    </div>
  );
}
