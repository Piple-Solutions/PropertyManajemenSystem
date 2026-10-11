import salesData from '../data/mock/sales.json';
import { reservationSourceLabels, reservationSourceColors } from '@/constants/reservationStatuses';

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

class SalesService {
  private data: any[] = [...salesData];

  getAll(): any[] {
    return this.data.map((item) => ({ ...item }));
  }

  getById(id: string): any | undefined {
    return this.data.find((item) => item.id === id);
  }

  getByDateRange(startDate: string, endDate: string): any[] {
    return this.data.filter((item) => {
      const date = new Date(item.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
  }

  getTotalByPeriod(startDate: string, endDate: string): number {
    return this.getByDateRange(startDate, endDate).reduce((sum, item) => sum + item.amount, 0);
  }

  getBySource(source: string): any[] {
    return this.data.filter((item) => item.source === source);
  }

  getSourceBreakdown(): SourceBreakdown[] {
    const total = this.data.reduce((sum, item) => sum + item.amount, 0);
    const sourceMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    this.data.forEach((item) => {
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

  getSummary(startDate: string, endDate: string): SalesSummary {
    const filtered = this.getByDateRange(startDate, endDate);
    const totalSales = filtered.reduce((sum: number, s: any) => sum + s.amount, 0);
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

  create(data: any): any {
    const newItem = {
      ...data,
      id: `sale-${String(this.data.length + 1).padStart(3, '0')}`,
    };
    this.data.push(newItem);
    return { ...newItem };
  }
}

export const salesService = new SalesService();
export default salesService;
