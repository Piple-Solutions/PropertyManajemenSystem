export const invoiceStatuses = ['Draft', 'Completed'] as const;
export const paymentStatuses = ['Pending', 'Paid'] as const;
export const invoiceStatusLabels: Record<string, string> = {
  Draft: 'Draft',
  Completed: 'Completed',
};
export const paymentStatusLabels: Record<string, string> = {
  Pending: 'Pending Payment',
  Paid: 'Paid',
};
export const invoiceStatusColors: Record<string, string> = {
  Draft: '#756A61',
  Completed: '#4F8A5B',
};
export const paymentStatusColors: Record<string, string> = {
  Pending: '#9A6A32',
  Paid: '#4F8A5B',
};
