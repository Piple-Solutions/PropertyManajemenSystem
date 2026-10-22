import { reservationSourceLabels, reservationSourceColors } from '@/constants/reservationStatuses';
import type { Sale } from '@/types/auth.types';
import { ApiError, fetchAllPages } from './api';

interface SourceBreakdown {
  source: string;
  label: string;
  color: string;
  totalSales: number;
  count: number;
  percentage: number;
}

interface SalesSummary {
  totalSales: number;
  totalIncome: number;
  totalExpenses: number;
  netRevenue: number;
  totalInvoices: number;
  totalTransactions: number;
  averagePerTransaction: number;
}

/**
 * Sales client backed by the real API (`/api/sales`) — FE-001.
 *
 * There is no sales table: the server DERIVES one sale per non-cancelled
 * invoice (`date = invoiceDate`, `amount = total`), so a sale appears as soon
 * as its invoice exists (Draft and Sent included: "billed", not "received").
 * Read-only; method names match the previous mock service and are now async.
 */
class SalesService {
  async getAll(): Promise<Sale[]> {
    return fetchAllPages<Sale>('/api/sales');
  }

  /** A user without `finance.sales.view` has no sales to show (dashboard). */
  async getAllIfPermitted(): Promise<Sale[]> {
    try {
      return await this.getAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) return [];
      throw err;
    }
  }

  async getById(id: string): Promise<Sale | undefined> {
    return (await this.getAll()).find((item) => item.id === id);
  }

  async getByDateRange(startDate: string, endDate: string): Promise<Sale[]> {
    return (await this.getAll()).filter((item) => item.date >= startDate && item.date <= endDate);
  }

  async getTotalByPeriod(startDate: string, endDate: string): Promise<number> {
    return (await this.getByDateRange(startDate, endDate)).reduce((sum, item) => sum + item.amount, 0);
  }

  async getBySource(source: string): Promise<Sale[]> {
    return (await this.getAll()).filter((item) => item.source === source);
  }

  async getSourceBreakdown(): Promise<SourceBreakdown[]> {
    const data = await this.getAll();
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    const sourceMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    data.forEach((item) => {
      sourceMap[item.source] = (sourceMap[item.source] || 0) + item.amount;
      countMap[item.source] = (countMap[item.source] || 0) + 1;
    });
    return Object.entries(sourceMap).map(([source, totalSales]) => ({
      source,
      label: reservationSourceLabels[source] || source,
      color: reservationSourceColors[source] || '#A0958B',
      totalSales,
      count: countMap[source] || 0,
      percentage: total > 0 ? Math.round((totalSales / total) * 100) : 0,
    }));
  }

  async getSummary(startDate: string, endDate: string): Promise<SalesSummary> {
    const filtered = await this.getByDateRange(startDate, endDate);
    const totalSales = filtered.reduce((sum, s) => sum + s.amount, 0);
    return {
      totalSales,
      totalIncome: totalSales,
      totalExpenses: 0,
      netRevenue: totalSales,
      totalInvoices: filtered.length,
      totalTransactions: filtered.length,
      averagePerTransaction: filtered.length > 0 ? Math.round(totalSales / filtered.length) : 0,
    };
  }
}

export const salesService = new SalesService();
export default salesService;
