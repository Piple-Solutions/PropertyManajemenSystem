import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { Card } from './Card';
import { invoiceStatuses, paymentStatuses } from '@/constants/invoiceStatuses';
import { reservationSources, reservationSourceLabels } from '@/constants/reservationStatuses';

const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  reservationId: z.string().optional(),
  guestName: z.string().min(2, 'Guest name must be at least 2 characters'),
  source: z.string().min(1, 'Source is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  items: z.array(z.object({
    description: z.string().min(1, 'Description is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0, 'Unit price must be at least 0'),
  })).min(1, 'At least one item is required'),
  discount: z.number().min(0, 'Discount must be at least 0').max(100, 'Discount cannot exceed 100%'),
  invoiceStatus: z.enum(['Draft', 'Sent', 'Completed', 'Cancelled']),
  paymentStatus: z.enum(['Pending', 'Paid', 'Overdue', 'Partial']),
});

type CreateInvoiceFormData = z.infer<typeof createInvoiceSchema>;

interface InvoiceFormProps {
  initialData?: Partial<CreateInvoiceFormData>;
  onSubmit: (data: CreateInvoiceFormData) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function InvoiceForm({ initialData, onSubmit, onCancel, loading = false }: InvoiceFormProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateInvoiceFormData>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      invoiceNumber: initialData?.invoiceNumber || '',
      reservationId: initialData?.reservationId || '',
      guestName: initialData?.guestName || '',
      source: initialData?.source || '',
      invoiceDate: initialData?.invoiceDate || '',
      items: initialData?.items || [{ description: '', quantity: 1, unitPrice: 0 }],
      discount: initialData?.discount || 0,
      invoiceStatus: initialData?.invoiceStatus || 'Draft',
      paymentStatus: initialData?.paymentStatus || 'Pending',
    },
  });

  const items = watch('items') || [];
  const paymentStatus = watch('paymentStatus');

  const addItem = () => {
    setValue('items', [...items, { description: '', quantity: 1, unitPrice: 0 }], { shouldValidate: true });
  };

  const total = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);

  return (
    <form onSubmit={handleSubmit((data) => {
      if (data.invoiceStatus === 'Completed' && data.paymentStatus !== 'Paid') {
        return;
      }
      onSubmit(data);
    })} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <Input label="Invoice Number" error={!!errors.invoiceNumber} errorMessage={errors.invoiceNumber?.message} {...register('invoiceNumber')} placeholder="INV-2026-001" />
          <Input label="Guest Name" error={!!errors.guestName} errorMessage={errors.guestName?.message} {...register('guestName')} placeholder="Enter guest name" />
          <Select label="Source" error={!!errors.source} options={reservationSources.map((s) => ({ value: s, label: reservationSourceLabels[s] || s }))} {...register('source')} />
          <Input label="Invoice Date" type="date" error={!!errors.invoiceDate} errorMessage={errors.invoiceDate?.message} {...register('invoiceDate')} />
          <Input label="Discount (%)" type="number" error={!!errors.discount} errorMessage={errors.discount?.message} {...register('discount', { valueAsNumber: true })} />

          <Select
            label="Invoice Status"
            options={invoiceStatuses.map((s) => ({
              value: s,
              label: s,
              disabled: s === 'Completed' && paymentStatus !== 'Paid',
            }))}
            {...register('invoiceStatus')}
          />
          <Select label="Payment Status" options={paymentStatuses.map((s) => ({ value: s, label: s }))} {...register('paymentStatus')} />
        </div>
      </Card>

      <Card title="Invoice Items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((_, index) => (
            <div key={index} className="inv-itemrow" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '8px', alignItems: 'end' }}>
              <Input
                label="Description"
                placeholder="Item description"
                {...register(`items.${index}.description` as const)}
              />
              <Input
                label="Quantity"
                type="number"
                {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
              />
              <Input
                label="Unit Price"
                type="number"
                {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
              />
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="inv-itemremove"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => {
                    const newItems = items.filter((_, i) => i !== index);
                    setValue('items', newItems, { shouldValidate: true });
                  }}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Add Item</Button>
        </div>
      </Card>

      <Card style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'right', marginRight: '16px' }}>
          <p style={{ fontSize: '14px', color: '#6B7881', margin: '4px 0' }}>Subtotal: Rp {total.toLocaleString('id-ID')}</p>
          <p style={{ fontSize: '14px', color: '#6B7881', margin: '4px 0' }}>Discount: {initialData?.discount || 0}% (Rp {(total * (initialData?.discount || 0) / 100).toLocaleString('id-ID')})</p>
          <p style={{ fontSize: '18px', fontWeight: 700, color: '#232D36', margin: '4px 0' }}>Total: Rp {(total - (total * (initialData?.discount || 0) / 100)).toLocaleString('id-ID')}</p>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        )}
        <Button type="submit" loading={loading}>
          {initialData ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}
