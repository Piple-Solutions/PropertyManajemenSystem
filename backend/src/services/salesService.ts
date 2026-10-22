import { and, ne, sql } from 'drizzle-orm';
import { invoices } from '../db/schema';
import type { AppDb } from '../db/client';
import { toDerivedSale, type PublicSale } from '../lib/presenters';
import type { SalesListQuery } from '../lib/validation';

/**
 * Read-only DERIVED sales. There is no sales table: each non-cancelled
 * invoice contributes one sale (`date = invoiceDate`, `amount = total`),
 * mirroring the frontend `Sale` shape (`id`, `reservationId?`,
 * `invoiceId`, `date`, `amount`, `source`, `description`).
 */
export async function listSales(db: AppDb, query: SalesListQuery): Promise<{ items: PublicSale[]; total: number }> {
  const conditions = [ne(invoices.invoiceStatus, 'Cancelled')];
  if (query.start) conditions.push(sql`${invoices.invoiceDate} >= ${query.start}`);
  if (query.end) conditions.push(sql`${invoices.invoiceDate} <= ${query.end}`);
  if (query.source !== 'all') conditions.push(sql`${invoices.source} = ${query.source}`);
  const where = and(...conditions);

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  // BE-035: insertion order; a date range walks the invoice_date index (as the unsorted query did).
  const order = query.start || query.end ? [invoices.invoiceDate, sql`rowid`] : [sql`rowid`];
  const rows = await db
    .select()
    .from(invoices)
    .where(where)
    .orderBy(...order)
    .limit(query.pageSize)
    .offset(offset);

  return { items: rows.map(toDerivedSale), total };
}

export interface SourceBreakdownRow {
  source: string;
  totalSales: number;
  count: number;
  percentage: number;
}

/** Mirrors `salesService.getSourceBreakdown()` (labels resolve client-side). */
export async function salesSourceBreakdown(
  db: AppDb,
  start: string,
  end: string,
): Promise<SourceBreakdownRow[]> {
  const conditions = [ne(invoices.invoiceStatus, 'Cancelled')];
  if (start) conditions.push(sql`${invoices.invoiceDate} >= ${start}`);
  if (end) conditions.push(sql`${invoices.invoiceDate} <= ${end}`);
  const where = and(...conditions);

  const rows = await db
    .select({
      source: invoices.source,
      totalSales: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(where)
    .groupBy(invoices.source);

  const grand = rows.reduce((sum, r) => sum + Number(r.totalSales ?? 0), 0);
  return rows.map((r) => {
    const totalSales = Number(r.totalSales ?? 0);
    return {
      source: r.source,
      totalSales,
      count: Number(r.count ?? 0),
      percentage: grand > 0 ? Math.round((totalSales / grand) * 100) : 0,
    };
  });
}

/**
 * BE-022: billed vs paid for the derived sales (non-Cancelled invoices).
 * Inclusive bounds; the legacy list and breakdown are unchanged.
 */
export interface SalesSummary {
  billedTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  count: number;
  paidCount: number;
  bySource: Array<{ source: string; billedTotal: number; paidTotal: number; count: number }>;
}

export async function salesSummary(db: AppDb, start: string, end: string, source = 'all'): Promise<SalesSummary> {
  const conditions = [ne(invoices.invoiceStatus, 'Cancelled')];
  if (start) conditions.push(sql`${invoices.invoiceDate} >= ${start}`);
  if (end) conditions.push(sql`${invoices.invoiceDate} <= ${end}`);
  if (source !== 'all') conditions.push(sql`${invoices.source} = ${source}`);

  const rows = await db
    .select({
      source: invoices.source,
      payment: invoices.paymentStatus,
      total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(and(...conditions))
    .groupBy(invoices.source, invoices.paymentStatus);

  const bySource = new Map<string, { source: string; billedTotal: number; paidTotal: number; count: number }>();
  let billedTotal = 0;
  let paidTotal = 0;
  let count = 0;
  let paidCount = 0;
  for (const r of rows) {
    const total = Number(r.total ?? 0);
    const n = Number(r.count ?? 0);
    const entry = bySource.get(r.source) ?? { source: r.source, billedTotal: 0, paidTotal: 0, count: 0 };
    entry.billedTotal += total;
    entry.count += n;
    billedTotal += total;
    count += n;
    if (r.payment === 'Paid') {
      entry.paidTotal += total;
      paidTotal += total;
      paidCount += n;
    }
    bySource.set(r.source, entry);
  }
  return {
    billedTotal,
    paidTotal,
    unpaidTotal: billedTotal - paidTotal,
    count,
    paidCount,
    bySource: [...bySource.values()].sort((a, b) => (a.source < b.source ? -1 : 1)),
  };
}
