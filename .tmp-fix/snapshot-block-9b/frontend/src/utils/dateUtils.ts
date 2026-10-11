export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function differenceInDays(start: Date, end: Date): number {
  const diffTime = Math.abs(new Date(end).getTime() - new Date(start).getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return new Date(date) >= new Date(start) && new Date(date) <= new Date(end);
}

export function isFutureDate(date: Date): boolean {
  return new Date(date) >= new Date();
}

export function isCheckOutAfterCheckIn(checkOut: Date, checkIn: Date): boolean {
  return new Date(checkOut) > new Date(checkIn);
}
