export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = new Date(date);
  if (format === 'iso') return d.toISOString().split('T')[0];
  if (format === 'short') return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}
