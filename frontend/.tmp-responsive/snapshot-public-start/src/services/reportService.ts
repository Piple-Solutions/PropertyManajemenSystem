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

class ReportService {
  getSalesSummary(startDate: string, endDate: string): SalesSummary {
    const sales = salesService.getByDateRange(startDate, endDate);
    const expenses = expenseService.getAll().filter((exp) => {
      const date = new Date(exp.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
    const invoices = invoiceService.getAll().filter((inv) => {
      const date = new Date(inv.invoiceDate);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });

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

  getRevenueByPeriod(months: string[]): RevenueByPeriod[] {
    return months.map((month) => {
      const sales = salesService.getAll().filter((s) => s.date.startsWith(month));
      const expenses = expenseService.getAll().filter((e) => e.date.startsWith(month));
      const revenue = sales.reduce((sum, s) => sum + s.amount, 0);
      const expense = expenses.reduce((sum, e) => sum + e.amount, 0);
      return { month, revenue, expenses: expense, net: revenue - expense };
    });
  }

  getExpensesByCategory(): ExpenseByCategory[] {
    const expenses = expenseService.getAll();
    const categoryMap: Record<string, number> = {};
    expenses.forEach((exp) => {
      categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
    });
    return Object.entries(categoryMap).map(([category, amount]) => ({ category, amount }));
  }

  getTopInvoices(limit = 5): Invoice[] {
    return invoiceService.getAll().sort((a, b) => b.total - a.total).slice(0, limit);
  }
}

export const reportService = new ReportService();
export default reportService;
