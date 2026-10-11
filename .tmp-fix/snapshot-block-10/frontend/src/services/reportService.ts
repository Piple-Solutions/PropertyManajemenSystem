import { invoiceService } from './invoiceService';
import { salesService } from './salesService';
import { expenseService } from './expenseService';
import type { Invoice } from '@/types/auth.types';

interface SalesSummary {
  totalSales: number;
  totalIncome: number;
  totalExpenses: number;
  netRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
}

interface RevenueByPeriod {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}

interface ExpenseByCategory {
  category: string;
  amount: number;
}

/**
 * Report helpers over the (now API-backed, async) finance services — FE-001.
 * Formulas are unchanged; every method is async because its inputs are.
 */
class ReportService {
  async getSalesSummary(startDate: string, endDate: string): Promise<SalesSummary> {
    const [sales, allExpenses, allInvoices] = await Promise.all([
      salesService.getByDateRange(startDate, endDate),
      expenseService.getAll(),
      invoiceService.getAll(),
    ]);
    const expenses = allExpenses.filter((exp) => exp.date >= startDate && exp.date <= endDate);
    const invoices = allInvoices.filter((inv) => inv.invoiceDate >= startDate && inv.invoiceDate <= endDate);

    const totalSales = sales.reduce((sum, s) => sum + s.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalInvoices = invoices.length;
    const paidInvoices = invoices.filter((inv) => inv.invoiceStatus === 'Completed').length;
    const pendingInvoices = invoices.filter((inv) => inv.invoiceStatus === 'Draft').length;
    const overdueInvoices = invoices.filter((inv) => inv.paymentStatus === 'Overdue').length;

    return {
      totalSales,
      totalIncome: totalSales,
      totalExpenses,
      netRevenue: totalSales - totalExpenses,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
    };
  }

  async getRevenueByPeriod(months: string[]): Promise<RevenueByPeriod[]> {
    const [allSales, allExpenses] = await Promise.all([salesService.getAll(), expenseService.getAll()]);
    return months.map((month) => {
      const revenue = allSales.filter((s) => s.date.startsWith(month)).reduce((sum, s) => sum + s.amount, 0);
      const expense = allExpenses.filter((e) => e.date.startsWith(month)).reduce((sum, e) => sum + e.amount, 0);
      return { month, revenue, expenses: expense, net: revenue - expense };
    });
  }

  async getExpensesByCategory(): Promise<ExpenseByCategory[]> {
    const expenses = await expenseService.getAll();
    const categoryMap: Record<string, number> = {};
    expenses.forEach((exp) => {
      categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
    });
    return Object.entries(categoryMap).map(([category, amount]) => ({ category, amount }));
  }

  async getTopInvoices(limit = 5): Promise<Invoice[]> {
    return (await invoiceService.getAll()).sort((a, b) => b.total - a.total).slice(0, limit);
  }
}

export const reportService = new ReportService();
export default reportService;
