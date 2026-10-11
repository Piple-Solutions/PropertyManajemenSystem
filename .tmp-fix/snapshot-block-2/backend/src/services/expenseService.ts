import { and, eq, like, or, sql } from 'drizzle-orm';
import { expenses } from '../db/schema';
import type { AppDb } from '../db/client';
import { notFound } from '../lib/errors';
import { toPublicExpense, type PublicExpense } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ExpenseListQuery } from '../lib/validation';

export interface CreateExpenseInput {
  date: string;
  category: 'Utilities' | 'Staff' | 'Maintenance' | 'Supplies' | 'Marketing' | 'Food & Beverage' | 'Laundry' | 'Other';
  description: string;
  amount: number;
  status?: 'Paid' | 'Pending';
}

export interface UpdateExpenseInput {
  date?: string;
  category?: CreateExpenseInput['category'];
  description?: string;
  amount?: number;
  status?: 'Paid' | 'Pending';
}

export async function listExpenses(db: AppDb, query: ExpenseListQuery): Promise<{ items: PublicExpense[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(expenses.description, pattern), like(expenses.category, pattern)));
  }
  if (query.category !== 'all') conditions.push(eq(expenses.category, query.category));
  if (query.status !== 'all') conditions.push(eq(expenses.status, query.status));
  if (query.start) conditions.push(sql`${expenses.date} >= ${query.start}`);
  if (query.end) conditions.push(sql`${expenses.date} <= ${query.end}`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db.select().from(expenses).where(where).limit(query.pageSize).offset(offset);

  return { items: rows.map(toPublicExpense), total };
}

export async function getExpense(db: AppDb, id: string): Promise<PublicExpense> {
  const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Expense not found');
  return toPublicExpense(row);
}

export async function createExpense(db: AppDb, input: CreateExpenseInput): Promise<PublicExpense> {
  const now = nowIso();
  const id = newId('exp');
  await db.insert(expenses).values({
    id,
    date: input.date,
    category: input.category,
    description: input.description.trim(),
    amount: Math.round(input.amount),
    status: input.status ?? 'Pending',
    createdAt: now,
    updatedAt: now,
  });
  return getExpense(db, id);
}

export async function updateExpense(db: AppDb, id: string, input: UpdateExpenseInput): Promise<PublicExpense> {
  const rows = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Expense not found');

  const patch: Partial<{ date: string; category: string; description: string; amount: number; status: string; updatedAt: string }> = {
    updatedAt: nowIso(),
  };
  if (input.date !== undefined) patch.date = input.date;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.amount !== undefined) patch.amount = Math.round(input.amount);
  if (input.status !== undefined) patch.status = input.status;

  await db.update(expenses).set(patch).where(eq(expenses.id, id));
  return getExpense(db, id);
}

export async function deleteExpense(db: AppDb, id: string): Promise<void> {
  const rows = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Expense not found');
  await db.delete(expenses).where(eq(expenses.id, id));
}
