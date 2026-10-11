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
  const rows = await db.select().from(invoices).where(where).limit(query.pageSize).offset(offset);

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
