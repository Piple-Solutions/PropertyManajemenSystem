import expensesData from '../data/mock/expenses.json';
import type { Expense } from '@/types/auth.types';

class ExpenseService {
  private data: Expense[] = [...expensesData as Expense[]];

  getAll(): Expense[] {
    return this.data.map((item) => ({ ...item }));
  }

  getById(id: string): Expense | undefined {
    return this.data.find((item) => item.id === id);
  }

  getByCategory(category: string): Expense[] {
    return this.data.filter((item) => item.category === category);
  }

  getByStatus(status: string): Expense[] {
    return this.data.filter((item) => item.status === status);
  }

  getTotalByPeriod(startDate: string, endDate: string): number {
    return this.data.filter((item) => {
      const date = new Date(item.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    }).reduce((sum, item) => sum + item.amount, 0);
  }

  create(data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Expense {
    const now = new Date().toISOString();
    const newItem: Expense = {
      ...data,
      id: `exp-${String(this.data.length + 1).padStart(3, '0')}`,
      createdAt: now,
      updatedAt: now,
    };
    this.data.push(newItem);
    return { ...newItem };
  }

  update(id: string, updates: Partial<Expense>): Expense | null {
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
}

export const expenseService = new ExpenseService();
export default expenseService;
