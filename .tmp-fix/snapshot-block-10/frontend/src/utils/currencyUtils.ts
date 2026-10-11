export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function calculateSubtotal(rate: number, nights: number): number {
  return rate * nights;
}

export function calculateTotal(subtotals: number[]): number {
  return subtotals.reduce((sum, subtotal) => sum + subtotal, 0);
}
