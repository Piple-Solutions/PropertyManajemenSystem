import type { Expense } from '@/types/auth.types';
import { ApiError, apiFetch, fetchAllPages } from './api';

/**
 * Expense client backed by the real API (`/api/expenses`) — FE-001.
 * Method names match the previous in-memory mock service; every method is now
 * async. The mock JSON is kept only as seed input for the backend.
 */
type ExpenseWrite = Pick<Expense, 'date' | 'category' | 'description' | 'amount'> & { status?: string };

function toBody(data: Partial<ExpenseWrite>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.date !== undefined) body.date = data.date;
  if (data.category !== undefined) body.category = data.category;
  if (data.description !== undefined) body.description = data.description;
  if (data.amount !== undefined) body.amount = data.amount;
  if (data.status !== undefined) body.status = data.status;
  return body;
}

class ExpenseService {
  async getAll(): Promise<Expense[]> {
    return fetchAllPages<Expense>('/api/expenses');
  }

  /** A user without `finance.expense.view` has no expenses to show (dashboard, sales, report). */
  async getAllIfPermitted(): Promise<Expense[]> {
    try {
      return await this.getAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) return [];
      throw err;
    }
  }

  async getById(id: string): Promise<Expense | undefined> {
    try {
      const json = await apiFetch<{ data: Expense }>(`/api/expenses/${encodeURIComponent(id)}`);
      return json.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async getByCategory(category: string): Promise<Expense[]> {
    return (await this.getAll()).filter((item) => item.category === category);
  }

  async getByStatus(status: string): Promise<Expense[]> {
    return (await this.getAll()).filter((item) => item.status === status);
  }

  async getTotalByPeriod(startDate: string, endDate: string): Promise<number> {
    return (await this.getAll())
      .filter((item) => item.date >= startDate && item.date <= endDate)
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async create(data: ExpenseWrite): Promise<Expense> {
    const json = await apiFetch<{ data: Expense }>('/api/expenses', { method: 'POST', body: toBody(data) });
    return json.data;
  }

  async update(id: string, updates: Partial<ExpenseWrite>): Promise<Expense | null> {
    try {
      const json = await apiFetch<{ data: Expense }>(`/api/expenses/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: toBody(updates),
      });
      return json.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    await apiFetch(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  }
}

export const expenseService = new ExpenseService();
export default expenseService;
