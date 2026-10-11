import { and, desc, inArray, ne, sql } from 'drizzle-orm';
import { expenses, invoices } from '../db/schema';
import type { AppDb } from '../db/client';

/**
 * Financial report summary. Formulas mirror
 * `frontend/src/services/reportService.ts#getSalesSummary` verbatim:
 * - totalSales: derived sales (non-cancelled invoices) in range
 * - totalExpenses: expenses in range (optionally category-filtered)
 * - netRevenue = totalSales - totalExpenses
 * - invoice counts in range: paid (Completed), pending (Draft),
 *   overdue (paymentStatus Overdue)
 * Client-side export/print (`xlsx` / `jspdf` / print CSS) keeps consuming
 * the same filtered dataset — no server-generated files.
 */
export interface ReportSummary {
  totalSales: number;
  totalIncome: number;
  totalExpenses: number;
  netRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  expenseByCategory: Array<{ category: string; amount: number }>;
}

export async function getReportSummary(
  db: AppDb,
  start: string,
  end: string,
  categories: string[],
): Promise<ReportSummary> {
  const salesRows = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
    .from(invoices)
    .where(
      and(
        ne(invoices.invoiceStatus, 'Cancelled'),
        sql`${invoices.invoiceDate} >= ${start}`,
        sql`${invoices.invoiceDate} <= ${end}`,
      ),
    );
  const totalSales = Number(salesRows[0]?.total ?? 0);

  const expenseConditions = [sql`${expenses.date} >= ${start}`, sql`${expenses.date} <= ${end}`];
  if (categories.length > 0) {
    expenseConditions.push(inArray(expenses.category, categories));
  }
  const expenseRows = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(...expenseConditions));
  const totalExpenses = Number(expenseRows[0]?.total ?? 0);

  const countRows = await db
    .select({
      status: invoices.invoiceStatus,
      payment: invoices.paymentStatus,
      count: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(and(sql`${invoices.invoiceDate} >= ${start}`, sql`${invoices.invoiceDate} <= ${end}`))
    .groupBy(invoices.invoiceStatus, invoices.paymentStatus);

  let totalInvoices = 0;
  let paidInvoices = 0;
  let pendingInvoices = 0;
  let overdueInvoices = 0;
  for (const r of countRows) {
    const n = Number(r.count ?? 0);
    totalInvoices += n;
    if (r.status === 'Completed') paidInvoices += n;
    if (r.status === 'Draft') pendingInvoices += n;
    if (r.payment === 'Overdue') overdueInvoices += n;
  }

  const catRows = await db
    .select({
      category: expenses.category,
      amount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(...expenseConditions))
    .groupBy(expenses.category);

  return {
    totalSales,
    totalIncome: totalSales,
    totalExpenses,
    netRevenue: totalSales - totalExpenses,
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
    expenseByCategory: catRows.map((r) => ({ category: r.category, amount: Number(r.amount ?? 0) })),
  };
}

/** Top invoices by total (mirrors `reportService.getTopInvoices`). */
export async function getTopInvoices(
  db: AppDb,
  limit = 5,
): Promise<Array<{ id: string; invoiceNumber: string; guestName: string; invoiceStatus: string; paymentStatus: string; total: number }>> {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      guestName: invoices.guestName,
      invoiceStatus: invoices.invoiceStatus,
      paymentStatus: invoices.paymentStatus,
      total: invoices.total,
    })
    .from(invoices)
    .where(ne(invoices.invoiceStatus, 'Cancelled'))
    .orderBy(desc(invoices.total))
    .limit(limit);
  return rows.map((r) => ({ ...r }));
}

/**
 * BE-022: explicit billed vs paid figures. Billed = every non-Cancelled
 * invoice dated in range (this is what the legacy `totalSales` has always
 * counted, Drafts included); paid = those with `paymentStatus = 'Paid'`.
 * Both date bounds are inclusive. The legacy `/summary` response is unchanged.
 */
export interface RevenueSummary {
  start: string;
  end: string;
  billedTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  billedCount: number;
  paidCount: number;
  unpaidCount: number;
  totalExpenses: number;
  /** billed - expenses (same arithmetic as the legacy netRevenue). */
  netBilled: number;
  /** paid - expenses: cash actually received minus expenses. */
  netPaid: number;
}

export async function getRevenueSummary(db: AppDb, start: string, end: string, categories: string[] = []): Promise<RevenueSummary> {
  const rows = await db
    .select({
      payment: invoices.paymentStatus,
      total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(
      and(
        ne(invoices.invoiceStatus, 'Cancelled'),
        sql`${invoices.invoiceDate} >= ${start}`,
        sql`${invoices.invoiceDate} <= ${end}`,
      ),
    )
    .groupBy(invoices.paymentStatus);

  let billedTotal = 0;
  let paidTotal = 0;
  let billedCount = 0;
  let paidCount = 0;
  for (const r of rows) {
    const total = Number(r.total ?? 0);
    const count = Number(r.count ?? 0);
    billedTotal += total;
    billedCount += count;
    if (r.payment === 'Paid') {
      paidTotal += total;
      paidCount += count;
    }
  }

  const expenseConditions = [sql`${expenses.date} >= ${start}`, sql`${expenses.date} <= ${end}`];
  if (categories.length > 0) expenseConditions.push(inArray(expenses.category, categories));
  const expenseRows = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(...expenseConditions));
  const totalExpenses = Number(expenseRows[0]?.total ?? 0);

  return {
    start,
    end,
    billedTotal,
    paidTotal,
    unpaidTotal: billedTotal - paidTotal,
    billedCount,
    paidCount,
    unpaidCount: billedCount - paidCount,
    totalExpenses,
    netBilled: billedTotal - totalExpenses,
    netPaid: paidTotal - totalExpenses,
  };
}
