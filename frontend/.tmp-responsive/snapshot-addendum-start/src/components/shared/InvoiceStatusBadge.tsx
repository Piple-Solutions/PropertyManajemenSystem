import { Badge } from './Badge';
import { invoiceStatusLabels, paymentStatusLabels } from '@/constants/invoiceStatuses';

interface InvoiceStatusBadgeProps {
  invoiceStatus: string;
  paymentStatus?: string;
}

export function InvoiceStatusBadge({ invoiceStatus, paymentStatus }: InvoiceStatusBadgeProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <Badge variant={invoiceStatus === 'Completed' ? 'success' : invoiceStatus === 'Cancelled' ? 'danger' : invoiceStatus === 'Sent' ? 'info' : 'default'}>
        {invoiceStatusLabels[invoiceStatus] || invoiceStatus}
      </Badge>
      {paymentStatus && (
        <Badge variant={paymentStatus === 'Paid' ? 'success' : paymentStatus === 'Overdue' ? 'danger' : paymentStatus === 'Partial' ? 'warning' : 'default'}>
          {paymentStatusLabels[paymentStatus] || paymentStatus}
        </Badge>
      )}
    </div>
  );
}
