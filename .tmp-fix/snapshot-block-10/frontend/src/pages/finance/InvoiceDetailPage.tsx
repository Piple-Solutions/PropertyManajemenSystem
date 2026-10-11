import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { invoiceService } from '@/services/invoiceService';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { InvoiceStatusBadge } from '@/components/shared/InvoiceStatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { InvoicePrintDocument } from '@/components/shared/InvoicePrintDocument';
import { ErrorState } from '@/components/shared/ErrorState';
import { Loading } from '@/components/shared/Loading';
import { useAsyncData } from '@/hooks/useAsyncData';
import { apiErrorMessage } from '@/services/api';
import type { Invoice } from '@/types/auth.types';
import '../../styles/finance-responsive.css';
import '../../styles/invoice-print.css';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);
  // FE-001: the invoice comes from the API (async).
  const { data: invoice, isLoading, error: loadError, reload } = useAsyncData<Invoice | undefined>(
    () => (id ? invoiceService.getById(id) : Promise.resolve(undefined)),
    undefined,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // A status action that the server refuses (e.g. already paid elsewhere) is
  // shown instead of reloading silently; success keeps the old reload.
  const runAction = async (action: (invoiceId: string) => Promise<boolean>, invoiceId: string) => {
    setActionError(null);
    try {
      await action(invoiceId);
      navigate(0);
    } catch (err) {
      setActionError(apiErrorMessage(err, ''));
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <Loading />
      </div>
    );
  }

  if (loadError !== null) {
    return (
      <div className="fin-page" style={{ maxWidth: '900px' }}>
        <ErrorState description={loadError || undefined} onRetry={reload} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div style={{ padding: 'var(--space-xl, 20px)', textAlign: 'center' }}>
        <h2 style={{ color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>Invoice not found</h2>
        <Button onClick={() => navigate('/dashboard/finance/invoices')}>Back to Invoices</Button>
      </div>
    );
  }

  const canSend = invoice.invoiceStatus === 'Draft';
  const canMarkPaid = invoice.invoiceStatus === 'Draft';
  const canCancel = invoice.invoiceStatus === 'Draft' || invoice.invoiceStatus === 'Sent';

  return (
    <div className="fin-page" style={{ maxWidth: '900px' }}>
      <div className="fin-head" style={{ marginBottom: '20px' }}>
        <Button variant="outline" onClick={() => navigate('/dashboard/finance/invoices')}><ArrowLeft size={14} aria-hidden="true" /> Back</Button>
        <h1 className="fin-h1" style={{ marginBottom: 0 }}>
          {invoice.invoiceNumber}
        </h1>
        <Button variant="outline" onClick={() => window.print()} aria-label={`Print ${invoice.invoiceNumber}`}>
          <Printer size={14} aria-hidden="true" /> Print Invoice
        </Button>
      </div>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Guest</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#232D36' }}>{invoice.guestName}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Source</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#232D36' }}><Badge variant="default">{reservationSourceLabels[invoice.source] || invoice.source}</Badge></p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Date</h4>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#232D36' }}>{invoice.invoiceDate}</p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6B7881', textTransform: 'uppercase' }}>Status</h4>
            <InvoiceStatusBadge invoiceStatus={invoice.invoiceStatus} paymentStatus={invoice.paymentStatus} />
          </div>
        </div>
      </Card>
      <Card title="Invoice Items" style={{ marginBottom: '16px' }}>
        {invoice.items.map((item: any) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #C7BBAB' }}>
            <div>
              <span style={{ color: '#232D36', fontWeight: 600 }}>{item.description}</span>
              <span style={{ marginLeft: '12px', fontSize: '13px', color: '#6B7881' }}>× {item.quantity}</span>
            </div>
            <span style={{ fontWeight: 600, color: '#232D36' }}>Rp {(item.quantity * item.unitPrice).toLocaleString('id-ID')}</span>
          </div>
        ))}
      </Card>
      <Card style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px' }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '4px 0', color: '#6B7881' }}>Subtotal: Rp {invoice.subtotal.toLocaleString('id-ID')}</p>
          <p style={{ margin: '4px 0', color: '#6B7881' }}>Discount: {invoice.discount}%</p>
          <p style={{ margin: '4px 0', fontSize: '18px', fontWeight: 700, color: '#232D36' }}>Total: Rp {invoice.total.toLocaleString('id-ID')}</p>
        </div>
      </Card>
      {actionError !== null && (
        <div style={{ marginTop: '16px' }}>
          <ErrorState description={actionError || undefined} />
        </div>
      )}
      {(canSend || canMarkPaid || canCancel) && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
          {canSend && (
            <Button onClick={() => runAction((invoiceId) => invoiceService.send(invoiceId), invoice.id)}>
              Mark as Sent
            </Button>
          )}
          {canMarkPaid && (
            <Button onClick={() => runAction((invoiceId) => invoiceService.markPaid(invoiceId), invoice.id)}>
              Mark as Paid
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel Invoice
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); void runAction((invoiceId) => invoiceService.cancel(invoiceId), invoice.id); }}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel ${invoice.invoiceNumber}? This action cannot be undone.`}
        confirmText="Yes, Cancel"
        destructive
      />
      <div className="invoice-print-area" aria-hidden="true">
        <InvoicePrintDocument invoice={invoice} />
      </div>
    </div>
  );
}
