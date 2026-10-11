import { reservationSourceLabels } from '@/constants/reservationStatuses';
import invoicesData from '../data/mock/invoices.json';
import type { Invoice } from '@/types/auth.types';

class InvoiceService {
  private data: Invoice[] = [...invoicesData as Invoice[]];

  getAll(): Invoice[] {
    return this.data.map((item) => ({ ...item }));
  }

  getById(id: string): Invoice | undefined {
    return this.data.find((item) => item.id === id);
  }

  getByStatus(status: Invoice['invoiceStatus']): Invoice[] {
    return this.data.filter((item) => item.invoiceStatus === status);
  }

  getByPaymentStatus(status: Invoice['paymentStatus']): Invoice[] {
    return this.data.filter((item) => item.paymentStatus === status);
  }

  getBySource(source: string): Invoice[] {
    return this.data.filter((item) => item.source === source);
  }

  getSourceBreakdown() {
    const total = this.data.reduce((sum, item) => sum + item.total, 0);
    const sourceMap: Record<string, number> = {};
    this.data.forEach((item) => {
      sourceMap[item.source] = (sourceMap[item.source] || 0) + item.total;
    });
    return Object.entries(sourceMap).map(([source, totalSales]) => ({
      source,
      label: reservationSourceLabels[source] || source,
      totalSales,
      count: this.data.filter((i) => i.source === source).length,
      percentage: total > 0 ? Math.round((totalSales / total) * 100) : 0,
    }));
  }

  create(data: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Invoice {
    const now = new Date().toISOString();
    const newItem: Invoice = {
      ...data,
      id: `inv-${String(this.data.length + 1).padStart(3, '0')}`,
      createdAt: now,
      updatedAt: now,
    };
    this.data.push(newItem);
    return { ...newItem };
  }

  update(id: string, updates: Partial<Invoice>): Invoice | null {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.data[index] = { ...this.data[index], ...updates, updatedAt: new Date().toISOString() };
    return { ...this.data[index] };
  }

  delete(id: string): boolean {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.data.splice(index, 1);
    return true;
  }

  cancel(id: string): boolean {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.data[index].invoiceStatus = 'Cancelled';
    this.data[index].updatedAt = new Date().toISOString();
    return true;
  }

  send(id: string): boolean {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.data[index].invoiceStatus = 'Sent';
    this.data[index].updatedAt = new Date().toISOString();
    return true;
  }

  markPaid(id: string): boolean {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.data[index].invoiceStatus = 'Completed';
    this.data[index].paymentStatus = 'Paid';
    this.data[index].updatedAt = new Date().toISOString();
    return true;
  }
}

export const invoiceService = new InvoiceService();
export default invoiceService;
