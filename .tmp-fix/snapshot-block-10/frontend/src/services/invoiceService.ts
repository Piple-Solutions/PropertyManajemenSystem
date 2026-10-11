import { reservationSourceLabels } from '@/constants/reservationStatuses';
import type { Invoice } from '@/types/auth.types';
import { ApiError, apiFetch, fetchAllPages } from './api';

/**
 * Invoice client backed by the real API (`/api/invoices`) — FE-001.
 *
 * Method names match the previous in-memory mock service; every method is now
 * async. The mock JSON (`data/mock/invoices.json`) is kept only as seed input
 * for the backend and is no longer imported here.
 *
 * Money is authoritative on the server: `subtotal`/`total` sent by a form are
 * ignored and recomputed (discount is a PERCENT 0-100).
 *
 * Status (Block 6 contract): the API does not accept a status on create or
 * update; a status only moves through `send` / `pay` / `cancel`. The invoice
 * form still offers both status selects, so `create`/`update` translate the
 * chosen values into the matching action after saving. A combination that has
 * no action (e.g. `Overdue`, `Partial`, or moving a Sent invoice back to
 * Draft) is sent as-is so the user gets the backend's own message.
 */
type InvoiceStatus = Invoice['invoiceStatus'];
type PaymentStatus = Invoice['paymentStatus'];

interface InvoiceWrite {
  invoiceNumber?: string;
  reservationId?: string;
  guestName?: string;
  source?: string;
  invoiceDate?: string;
  items?: Array<{ description: string; quantity: number; unitPrice: number }>;
  discount?: number;
  invoiceStatus?: InvoiceStatus;
  paymentStatus?: PaymentStatus;
}

type StatusAction = 'send' | 'pay' | 'cancel';

/** The action that moves an invoice from its current status to the requested one, if any. */
export function statusActionFor(
  current: { invoiceStatus: InvoiceStatus; paymentStatus: PaymentStatus },
  wanted: { invoiceStatus?: InvoiceStatus; paymentStatus?: PaymentStatus },
): StatusAction | 'none' | 'unsupported' {
  const status = wanted.invoiceStatus ?? current.invoiceStatus;
  const payment = wanted.paymentStatus ?? current.paymentStatus;
  if (status === current.invoiceStatus && payment === current.paymentStatus) return 'none';
  const open = current.invoiceStatus === 'Draft' || current.invoiceStatus === 'Sent';
  if (status === 'Completed' && payment === 'Paid' && open) return 'pay';
  if (status === 'Sent' && payment === current.paymentStatus && current.invoiceStatus === 'Draft') return 'send';
  if (status === 'Cancelled' && payment === current.paymentStatus && open) return 'cancel';
  return 'unsupported';
}

/** Only the fields the API accepts (never ids, subtotals or totals computed in the browser). */
function toBody(data: InvoiceWrite, withStatus: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.invoiceNumber !== undefined && data.invoiceNumber !== '') body.invoiceNumber = data.invoiceNumber;
  if (data.reservationId !== undefined && data.reservationId !== '') body.reservationId = data.reservationId;
  if (data.guestName !== undefined) body.guestName = data.guestName;
  if (data.source !== undefined) body.source = data.source;
  if (data.invoiceDate !== undefined) body.invoiceDate = data.invoiceDate;
  if (data.items !== undefined) {
    body.items = data.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice }));
  }
  if (data.discount !== undefined) body.discount = data.discount;
  if (withStatus) {
    if (data.invoiceStatus !== undefined) body.invoiceStatus = data.invoiceStatus;
    if (data.paymentStatus !== undefined) body.paymentStatus = data.paymentStatus;
  }
  return body;
}

class InvoiceService {
  async getAll(): Promise<Invoice[]> {
    return fetchAllPages<Invoice>('/api/invoices');
  }

  /**
   * For screens every signed-in user sees (dashboard, reservation list): a
   * user without `finance.invoice.view` simply has no invoices to show.
   */
  async getAllIfPermitted(): Promise<Invoice[]> {
    try {
      return await this.getAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) return [];
      throw err;
    }
  }

  async getById(id: string): Promise<Invoice | undefined> {
    try {
      const json = await apiFetch<{ data: Invoice }>(`/api/invoices/${encodeURIComponent(id)}`);
      return json.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async getByStatus(status: InvoiceStatus): Promise<Invoice[]> {
    return (await this.getAll()).filter((item) => item.invoiceStatus === status);
  }

  async getByPaymentStatus(status: PaymentStatus): Promise<Invoice[]> {
    return (await this.getAll()).filter((item) => item.paymentStatus === status);
  }

  async getBySource(source: string): Promise<Invoice[]> {
    return (await this.getAll()).filter((item) => item.source === source);
  }

  async getSourceBreakdown() {
    const data = await this.getAll();
    const total = data.reduce((sum, item) => sum + item.total, 0);
    const sourceMap: Record<string, number> = {};
    data.forEach((item) => {
      sourceMap[item.source] = (sourceMap[item.source] || 0) + item.total;
    });
    return Object.entries(sourceMap).map(([source, totalSales]) => ({
      source,
      label: reservationSourceLabels[source] || source,
      totalSales,
      count: data.filter((i) => i.source === source).length,
      percentage: total > 0 ? Math.round((totalSales / total) * 100) : 0,
    }));
  }

  /** Next free `INV-YYYY-NNN` for a date (server allocation; needs `finance.invoice.create`). */
  async getNextNumber(date?: string): Promise<string> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const json = await apiFetch<{ data: { invoiceNumber: string } }>(`/api/invoices/next-number${query}`);
    return json.data.invoiceNumber;
  }

  private async runAction(id: string, action: StatusAction): Promise<Invoice> {
    const json = await apiFetch<{ data: Invoice }>(`/api/invoices/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
    return json.data;
  }

  async create(data: InvoiceWrite): Promise<Invoice> {
    const action = statusActionFor({ invoiceStatus: 'Draft', paymentStatus: 'Pending' }, data);
    const json = await apiFetch<{ data: Invoice }>('/api/invoices', {
      method: 'POST',
      // An unsupported combination is sent WITH its status so the API answers
      // with its own explanation and nothing is created.
      body: toBody(data, action === 'unsupported'),
    });
    if (action === 'send' || action === 'pay' || action === 'cancel') return this.runAction(json.data.id, action);
    return json.data;
  }

  async update(id: string, updates: InvoiceWrite): Promise<Invoice | null> {
    const current = await this.getById(id);
    if (!current) return null;
    const action = statusActionFor(current, updates);
    const body = toBody(updates, action === 'unsupported');
    let saved = current;
    if (Object.keys(body).length > 0) {
      const json = await apiFetch<{ data: Invoice }>(`/api/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body });
      saved = json.data;
    }
    if (action === 'send' || action === 'pay' || action === 'cancel') return this.runAction(id, action);
    return saved;
  }

  /** Only Draft invoices can be deleted (the API answers 409 otherwise). */
  async delete(id: string): Promise<boolean> {
    await apiFetch(`/api/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  }

  async cancel(id: string): Promise<boolean> {
    await this.runAction(id, 'cancel');
    return true;
  }

  async send(id: string): Promise<boolean> {
    await this.runAction(id, 'send');
    return true;
  }

  async markPaid(id: string): Promise<boolean> {
    await this.runAction(id, 'pay');
    return true;
  }
}

export const invoiceService = new InvoiceService();
export default invoiceService;
