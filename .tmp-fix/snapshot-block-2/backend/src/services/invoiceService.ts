import { and, eq, like, or, sql } from 'drizzle-orm';
import { invoiceItems, invoices, reservations } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, notFound } from '../lib/errors';
import { toPublicInvoice, type PublicInvoice } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { InvoiceListQuery } from '../lib/validation';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  invoiceNumber?: string;
  reservationId?: string;
  guestName: string;
  source: string;
  invoiceDate: string;
  items: InvoiceItemInput[];
  discount?: number;
  invoiceStatus?: 'Draft' | 'Sent' | 'Completed' | 'Cancelled';
  paymentStatus?: 'Pending' | 'Paid' | 'Overdue' | 'Partial';
}

export interface UpdateInvoiceInput {
  invoiceNumber?: string;
  reservationId?: string;
  guestName?: string;
  source?: string;
  invoiceDate?: string;
  items?: InvoiceItemInput[];
  discount?: number;
  invoiceStatus?: 'Draft' | 'Sent' | 'Completed' | 'Cancelled';
  paymentStatus?: 'Pending' | 'Paid' | 'Overdue' | 'Partial';
}

export const TERMINAL_INVOICE_STATUSES = ['Completed', 'Cancelled'] as const;

function isTerminal(status: string): boolean {
  return (TERMINAL_INVOICE_STATUSES as readonly string[]).includes(status);
}

/** Server-side money math: integer IDR, discount as PERCENT 0-100. */
export function computeInvoiceTotals(items: InvoiceItemInput[], discount: number): {
  lines: Array<{ description: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal: number;
  total: number;
} {
  const lines = items.map((it) => {
    const quantity = Math.round(it.quantity);
    const unitPrice = Math.round(it.unitPrice);
    return { description: it.description.trim(), quantity, unitPrice, subtotal: quantity * unitPrice };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const total = Math.round(subtotal - (subtotal * discount) / 100);
  return { lines, subtotal, total };
}

async function assertReservationExists(db: AppDb, reservationId: string): Promise<void> {
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (rows.length === 0) {
    throw conflict(`Reservation not found: ${reservationId}`, {
      reservationId: [`Reservation not found: ${reservationId}`],
    });
  }
}

/**
 * Allocate a unique `INV-YYYY-NNN` number for the invoice year.
 * Retries on UNIQUE races (concurrent creates) — the UNIQUE constraint is
 * the final arbiter, this loop just finds the next free sequence fast.
 */
async function allocateInvoiceNumber(db: AppDb, invoiceDate: string): Promise<string> {
  const year = invoiceDate.slice(0, 4);
  const prefix = `INV-${year}-`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await db
      .select({ n: invoices.invoiceNumber })
      .from(invoices)
      .where(like(invoices.invoiceNumber, `${prefix}%`));
    let max = 0;
    for (const r of rows) {
      const m = /^INV-\d{4}-(\d+)$/.exec(r.n);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const candidate = `${prefix}${String(max + 1 + attempt).padStart(3, '0')}`;
    const clash = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, candidate))
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  // Extremely unlikely fallback: timestamp-suffixed, still matching the format.
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

async function resolveInvoiceNumber(
  db: AppDb,
  invoiceDate: string,
  requested: string | undefined,
  ignoreId?: string,
): Promise<string> {
  if (requested) {
    const clash = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, requested))
      .limit(1);
    if (clash.length === 0 || clash[0].id === ignoreId) return requested;
    // Client collision (e.g. the frontend `count + 1` generator raced):
    // fall through to server-side allocation instead of failing the write.
  }
  return allocateInvoiceNumber(db, invoiceDate);
}

async function loadInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  const itemRows = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  return toPublicInvoice(row, itemRows);
}

export async function listInvoices(db: AppDb, query: InvoiceListQuery): Promise<{ items: PublicInvoice[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(invoices.invoiceNumber, pattern), like(invoices.guestName, pattern)));
  }
  if (query.status !== 'all') conditions.push(eq(invoices.invoiceStatus, query.status));
  if (query.payment !== 'all') conditions.push(eq(invoices.paymentStatus, query.payment));
  if (query.source !== 'all') conditions.push(eq(invoices.source, query.source));
  if (query.start) conditions.push(sql`${invoices.invoiceDate} >= ${query.start}`);
  if (query.end) conditions.push(sql`${invoices.invoiceDate} <= ${query.end}`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(invoices)
    .where(where)
    .limit(query.pageSize)
    .offset(offset);

  const items: PublicInvoice[] = [];
  for (const row of rows) {
    const itemRows = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, row.id));
    items.push(toPublicInvoice(row, itemRows));
  }
  return { items, total };
}

export async function getInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  return loadInvoice(db, id);
}

export async function createInvoice(db: AppDb, input: CreateInvoiceInput): Promise<PublicInvoice> {
  if (input.reservationId) await assertReservationExists(db, input.reservationId.trim());
  const discount = input.discount ?? 0;
  const { lines, subtotal, total } = computeInvoiceTotals(input.items, discount);
  const invoiceNumber = await resolveInvoiceNumber(db, input.invoiceDate, input.invoiceNumber?.trim());

  const now = nowIso();
  const id = newId('inv');
  await db.insert(invoices).values({
    id,
    invoiceNumber,
    reservationId: input.reservationId?.trim() || null,
    guestName: input.guestName.trim(),
    source: input.source.trim(),
    invoiceDate: input.invoiceDate,
    subtotal,
    discount,
    total,
    paymentStatus: input.paymentStatus ?? 'Pending',
    invoiceStatus: input.invoiceStatus ?? 'Draft',
    createdAt: now,
    updatedAt: now,
  });
  for (const line of lines) {
    await db.insert(invoiceItems).values({
      id: newId('inv-item'),
      invoiceId: id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      createdAt: now,
    });
  }
  return loadInvoice(db, id);
}

export async function updateInvoice(db: AppDb, id: string, input: UpdateInvoiceInput): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  if (isTerminal(row.invoiceStatus)) {
    throw conflict(`Invoice ${row.invoiceNumber} is ${row.invoiceStatus} and cannot be edited.`, {
      invoiceStatus: [`Invoice is ${row.invoiceStatus} and cannot be edited.`],
    });
  }

  if (input.reservationId !== undefined && input.reservationId.trim()) {
    await assertReservationExists(db, input.reservationId.trim());
  }

  const nextStatus = input.invoiceStatus ?? row.invoiceStatus;
  const nextPayment = input.paymentStatus ?? row.paymentStatus;
  if (nextStatus === 'Completed' && nextPayment !== 'Paid') {
    throw conflict('Completed invoices must be Paid.', {
      paymentStatus: ['Completed invoices must be Paid.'],
    });
  }

  const patch: Partial<{
    invoiceNumber: string;
    reservationId: string | null;
    guestName: string;
    source: string;
    invoiceDate: string;
    subtotal: number;
    discount: number;
    total: number;
    paymentStatus: string;
    invoiceStatus: string;
    updatedAt: string;
  }> = { updatedAt: nowIso() };

  if (input.invoiceNumber !== undefined) {
    patch.invoiceNumber = await resolveInvoiceNumber(db, input.invoiceDate ?? row.invoiceDate, input.invoiceNumber.trim(), id);
  }
  if (input.reservationId !== undefined) patch.reservationId = input.reservationId.trim() || null;
  if (input.guestName !== undefined) patch.guestName = input.guestName.trim();
  if (input.source !== undefined) patch.source = input.source.trim();
  if (input.invoiceDate !== undefined) patch.invoiceDate = input.invoiceDate;
  if (input.paymentStatus !== undefined) patch.paymentStatus = input.paymentStatus;
  if (input.invoiceStatus !== undefined) patch.invoiceStatus = input.invoiceStatus;

  if (input.items !== undefined || input.discount !== undefined) {
    const discount = input.discount ?? row.discount;
    const currentItems =
      input.items ??
      (await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id))).map((r) => ({
        description: r.description,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
      }));
    const { lines, subtotal, total } = computeInvoiceTotals(currentItems, discount);
    patch.subtotal = subtotal;
    patch.discount = discount;
    patch.total = total;
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    const now = nowIso();
    for (const line of lines) {
      await db.insert(invoiceItems).values({
        id: newId('inv-item'),
        invoiceId: id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        createdAt: now,
      });
    }
  }

  await db.update(invoices).set(patch).where(eq(invoices.id, id));
  return loadInvoice(db, id);
}

export async function deleteInvoice(db: AppDb, id: string): Promise<void> {
  const rows = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Invoice not found');
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  await db.delete(invoices).where(eq(invoices.id, id));
}

/** Draft -> Sent. Mirrors `invoiceService.send()`. */
export async function sendInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  if (row.invoiceStatus !== 'Draft') {
    throw conflict(`Only Draft invoices can be sent (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft invoices can be sent.'],
    });
  }
  await db.update(invoices).set({ invoiceStatus: 'Sent', updatedAt: nowIso() }).where(eq(invoices.id, id));
  return loadInvoice(db, id);
}

/**
 * Draft|Sent -> Completed + Paid, atomically.
 * Mirrors `invoiceService.markPaid()` (single flip, no payment history —
 * the frontend has no payment history/method UI).
 */
export async function payInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  if (row.invoiceStatus !== 'Draft' && row.invoiceStatus !== 'Sent') {
    throw conflict(`Only Draft or Sent invoices can be marked paid (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be marked paid.'],
    });
  }
  await db
    .update(invoices)
    .set({ invoiceStatus: 'Completed', paymentStatus: 'Paid', updatedAt: nowIso() })
    .where(eq(invoices.id, id));
  return loadInvoice(db, id);
}

/** Draft|Sent -> Cancelled (paymentStatus untouched). Mirrors `invoiceService.cancel()`. */
export async function cancelInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  if (row.invoiceStatus !== 'Draft' && row.invoiceStatus !== 'Sent') {
    throw conflict(`Only Draft or Sent invoices can be cancelled (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be cancelled.'],
    });
  }
  await db.update(invoices).set({ invoiceStatus: 'Cancelled', updatedAt: nowIso() }).where(eq(invoices.id, id));
  return loadInvoice(db, id);
}

/** Next free number preview (lets the UI keep its `INV-YYYY-NNN` placeholder). */
export async function nextInvoiceNumber(db: AppDb, invoiceDate: string): Promise<string> {
  return allocateInvoiceNumber(db, invoiceDate);
}

export async function invoiceNumberTaken(db: AppDb, invoiceNumber: string, ignoreId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.invoiceNumber, invoiceNumber))
    .limit(1);
  return rows.length > 0 && rows[0].id !== ignoreId;
}
