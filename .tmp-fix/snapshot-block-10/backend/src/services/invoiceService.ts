import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { invoiceItems, invoices, reservations } from '../db/schema';
import type { AppDb } from '../db/client';
import { changesOf, chunkByParams, isUniqueViolation, runAtomic, valuesList, type AtomicStatement } from '../lib/atomic';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { toPublicInvoice, type PublicInvoice } from '../lib/presenters';
import { likeContains } from '../lib/sql';
import { newId, nowIso } from '../lib/tokens';
import { INVOICE_STATUS_VIA_ACTIONS, MAX_INVOICE_SUBTOTAL, type InvoiceListQuery } from '../lib/validation';

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
      .where(like(invoices.invoiceNumber, `${prefix}%`));  // prefix is server-built (INV-YYYY-)
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

/** Audit hook (Block 3): receives the row exactly as loaded BEFORE the mutation (no extra query). */
export type InvoiceBeforeCapture = (row: {
  invoiceNumber: string;
  guestName: string;
  subtotal: number;
  discount: number;
  total: number;
  invoiceStatus: string;
  paymentStatus: string;
}) => void;

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
    conditions.push(or(likeContains(invoices.invoiceNumber, query.search), likeContains(invoices.guestName, query.search)));
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

  // BE-035: insertion order, except a date-range-only filter which has always
  // walked the invoice_date index (an equality filter on status/payment wins
  // the planner and keeps insertion order).
  const byIndexedEquality = query.status !== 'all' || query.payment !== 'all';
  const dateRange = Boolean(query.start || query.end);
  const order = !byIndexedEquality && dateRange ? [invoices.invoiceDate, sql`rowid`] : [sql`rowid`];
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(invoices)
    .where(where)
    .orderBy(...order)
    .limit(query.pageSize)
    .offset(offset);

  // BE-027: items for the whole page in one query (was one per invoice).
  const itemsBy = new Map<string, Array<typeof invoiceItems.$inferSelect>>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 90) {
    const part = await db
      .select()
      .from(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, ids.slice(i, i + 90)))
      .orderBy(sql`rowid`);
    for (const it of part) {
      const list = itemsBy.get(it.invoiceId) ?? [];
      list.push(it);
      itemsBy.set(it.invoiceId, list);
    }
  }
  return { items: rows.map((row) => toPublicInvoice(row, itemsBy.get(row.id) ?? [])), total };
}

export async function getInvoice(db: AppDb, id: string): Promise<PublicInvoice> {
  return loadInvoice(db, id);
}

/** Item rows for one invoice, chunked to D1's bound-parameter cap (7 values per row). */
function itemInserts(
  db: AppDb,
  invoiceId: string,
  lines: Array<{ description: string; quantity: number; unitPrice: number; subtotal: number }>,
  createdAt: string,
): AtomicStatement[] {
  const rows = lines.map((line) => ({
    id: newId('inv-item'),
    invoiceId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    subtotal: line.subtotal,
    createdAt,
  }));
  return chunkByParams(rows, 7, 0).map((chunk) => db.insert(invoiceItems).values(chunk));
}

/** BE-031: a sum that is not a safe integer, or above the invoice cap, is rejected before any write. */
function assertTotalsWithinCap(subtotal: number): void {
  if (!Number.isSafeInteger(subtotal) || subtotal > MAX_INVOICE_SUBTOTAL) {
    const msg = 'Total invoice melebihi batas yang diizinkan.';
    throw unprocessable(msg, { items: [msg] });
  }
}

export async function createInvoice(db: AppDb, input: CreateInvoiceInput): Promise<PublicInvoice> {
  if (input.reservationId) await assertReservationExists(db, input.reservationId.trim());
  const discount = input.discount ?? 0;
  const { lines, subtotal, total } = computeInvoiceTotals(input.items, discount);
  assertTotalsWithinCap(subtotal);

  const now = nowIso();
  const id = newId('inv');
  // BE-018: header + items are ONE transaction. If a concurrent create takes
  // the same invoice number the batch rolls back (UNIQUE) and a new number is
  // allocated; nothing half-written survives.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await resolveInvoiceNumber(db, input.invoiceDate, attempt === 0 ? input.invoiceNumber?.trim() : undefined);
    try {
      await runAtomic(db, [
        db.insert(invoices).values({
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
        }),
        ...itemInserts(db, id, lines, now),
      ]);
      return loadInvoice(db, id);
    } catch (err) {
      if (isUniqueViolation(err, 'invoices.invoice_number')) continue;
      throw err;
    }
  }
  throw conflict('Nomor invoice bentrok dengan permintaan lain. Silakan coba lagi.');
}

export async function updateInvoice(
  db: AppDb,
  id: string,
  input: UpdateInvoiceInput,
  capture?: InvoiceBeforeCapture,
): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  capture?.(row);
  if (isTerminal(row.invoiceStatus)) {
    throw conflict(`Invoice ${row.invoiceNumber} is ${row.invoiceStatus} and cannot be edited.`, {
      invoiceStatus: [`Invoice is ${row.invoiceStatus} and cannot be edited.`],
    });
  }

  if (input.reservationId !== undefined && input.reservationId.trim()) {
    await assertReservationExists(db, input.reservationId.trim());
  }

  // BE-020: status is NOT editable here. Sending the value the invoice
  // already has is a harmless no-op (forms post the whole object); any
  // different value must go through send / pay / cancel.
  const statusErrors: Record<string, string[]> = {};
  if (input.invoiceStatus !== undefined && input.invoiceStatus !== row.invoiceStatus) {
    statusErrors.invoiceStatus = [INVOICE_STATUS_VIA_ACTIONS];
  }
  if (input.paymentStatus !== undefined && input.paymentStatus !== row.paymentStatus) {
    statusErrors.paymentStatus = [INVOICE_STATUS_VIA_ACTIONS];
  }
  if (Object.keys(statusErrors).length > 0) throw unprocessable(INVOICE_STATUS_VIA_ACTIONS, statusErrors);

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

  // BE-018: everything is computed first; the writes are ONE transaction and
  // only apply while the invoice still has the status validated above.
  const statements: AtomicStatement[] = [];
  const stillSameStatus = sql`EXISTS (SELECT 1 FROM invoices g WHERE g.id = ${id} AND g.invoice_status = ${row.invoiceStatus})`;
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
    assertTotalsWithinCap(subtotal);
    patch.subtotal = subtotal;
    patch.discount = discount;
    patch.total = total;
    const now = nowIso();
    statements.push(sql`DELETE FROM invoice_items WHERE invoice_id = ${id} AND ${stillSameStatus}`);
    const rows = lines.map((line) => [newId('inv-item'), line.description, line.quantity, line.unitPrice, line.subtotal]);
    for (const chunk of chunkByParams(rows, 5, 4)) {
      statements.push(sql`
        INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, subtotal, created_at)
        SELECT v.column1, i.id, v.column2, v.column3, v.column4, v.column5, ${now}
        FROM (VALUES ${valuesList(chunk)}) v
        JOIN invoices i ON i.id = ${id} AND i.invoice_status = ${row.invoiceStatus}`);
    }
  }

  // The header goes LAST: it may itself change `invoice_status`, which the
  // item statements above use as their guard.
  statements.push(
    db
      .update(invoices)
      .set(patch)
      .where(and(eq(invoices.id, id), eq(invoices.invoiceStatus, row.invoiceStatus))),
  );
  const results = await runAtomic(db, statements);
  if (changesOf(results[results.length - 1]) !== 1) throw await invoiceStatusChanged(db, id);
  return loadInvoice(db, id);
}

/** 409 for a write that lost a race with another status change. */
async function invoiceStatusChanged(db: AppDb, id: string) {
  const current = await db.select({ s: invoices.invoiceStatus, n: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, id)).limit(1);
  if (current.length === 0) return notFound('Invoice not found');
  const msg = `Status invoice ${current[0].n} telah berubah menjadi ${current[0].s}. Muat ulang data lalu coba lagi.`;
  return conflict(msg, { invoiceStatus: [msg] });
}

/**
 * BE-019: only a Draft (never sent, never paid) may be physically deleted.
 * Anything else is financial history: cancel it instead (it is kept, with
 * its number). The delete is conditional on the status, so an invoice that
 * is sent or paid between the check and the write is not removed.
 */
export async function deleteInvoice(db: AppDb, id: string): Promise<void> {
  const rows = await db
    .select({ id: invoices.id, status: invoices.invoiceStatus, number: invoices.invoiceNumber })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (rows.length === 0) throw notFound('Invoice not found');
  const refuse = (status: string, number: string) => {
    const msg =
      status === 'Cancelled'
        ? `Invoice ${number} sudah dibatalkan dan disimpan sebagai riwayat; hanya invoice Draft yang dapat dihapus.`
        : `Hanya invoice Draft yang dapat dihapus. Invoice ${number} berstatus ${status}; batalkan (cancel) invoice ini bila tidak berlaku.`;
    return conflict(msg, { invoiceStatus: [msg] });
  };
  if (rows[0].status !== 'Draft') throw refuse(rows[0].status, rows[0].number);
  const results = await runAtomic(db, [
    sql`DELETE FROM invoice_items WHERE invoice_id = ${id} AND EXISTS (SELECT 1 FROM invoices g WHERE g.id = ${id} AND g.invoice_status = 'Draft')`,
    db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.invoiceStatus, 'Draft'))),
  ]);
  if (changesOf(results[1]) !== 1) {
    const current = await db.select({ s: invoices.invoiceStatus }).from(invoices).where(eq(invoices.id, id)).limit(1);
    if (current.length === 0) throw notFound('Invoice not found');
    throw refuse(current[0].s, rows[0].number);
  }
}

/**
 * BE-018: a status move is a conditional `UPDATE ... WHERE invoice_status =
 * <the status that was validated>`. When two actions race (pay vs cancel,
 * double pay) exactly one changes a row; the loser gets the same 409 it would
 * have received had it arrived a moment later.
 */
async function moveInvoice(
  db: AppDb,
  id: string,
  fromStatus: string,
  set: { invoiceStatus: string; paymentStatus?: string; updatedAt: string },
  refuse: (currentStatus: string) => Error,
): Promise<void> {
  const done = await db
    .update(invoices)
    .set(set)
    .where(and(eq(invoices.id, id), eq(invoices.invoiceStatus, fromStatus)))
    .run();
  if (changesOf(done) === 1) return;
  const current = await db.select({ s: invoices.invoiceStatus }).from(invoices).where(eq(invoices.id, id)).limit(1);
  if (current.length === 0) throw notFound('Invoice not found');
  throw refuse(current[0].s);
}

/** Draft -> Sent. Mirrors `invoiceService.send()`. */
export async function sendInvoice(db: AppDb, id: string, capture?: InvoiceBeforeCapture): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  capture?.(row);
  if (row.invoiceStatus !== 'Draft') {
    throw conflict(`Only Draft invoices can be sent (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft invoices can be sent.'],
    });
  }
  await moveInvoice(db, id, row.invoiceStatus, { invoiceStatus: 'Sent', updatedAt: nowIso() }, (current) =>
    conflict(`Only Draft invoices can be sent (current: ${current}).`, { invoiceStatus: ['Only Draft invoices can be sent.'] }),
  );
  return loadInvoice(db, id);
}

/**
 * Draft|Sent -> Completed + Paid, atomically.
 * Mirrors `invoiceService.markPaid()` (single flip, no payment history —
 * the frontend has no payment history/method UI).
 */
export async function payInvoice(db: AppDb, id: string, capture?: InvoiceBeforeCapture): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  capture?.(row);
  if (row.invoiceStatus !== 'Draft' && row.invoiceStatus !== 'Sent') {
    throw conflict(`Only Draft or Sent invoices can be marked paid (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be marked paid.'],
    });
  }
  await moveInvoice(db, id, row.invoiceStatus, { invoiceStatus: 'Completed', paymentStatus: 'Paid', updatedAt: nowIso() }, (current) =>
    conflict(`Only Draft or Sent invoices can be marked paid (current: ${current}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be marked paid.'],
    }),
  );
  return loadInvoice(db, id);
}

/** Draft|Sent -> Cancelled (paymentStatus untouched). Mirrors `invoiceService.cancel()`. */
export async function cancelInvoice(db: AppDb, id: string, capture?: InvoiceBeforeCapture): Promise<PublicInvoice> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Invoice not found');
  capture?.(row);
  if (row.invoiceStatus !== 'Draft' && row.invoiceStatus !== 'Sent') {
    throw conflict(`Only Draft or Sent invoices can be cancelled (current: ${row.invoiceStatus}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be cancelled.'],
    });
  }
  await moveInvoice(db, id, row.invoiceStatus, { invoiceStatus: 'Cancelled', updatedAt: nowIso() }, (current) =>
    conflict(`Only Draft or Sent invoices can be cancelled (current: ${current}).`, {
      invoiceStatus: ['Only Draft or Sent invoices can be cancelled.'],
    }),
  );
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
