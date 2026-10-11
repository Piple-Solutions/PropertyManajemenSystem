import { useState, useMemo } from 'react';
import { Banknote, TrendingDown, Wallet, ReceiptText } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { StatsCard } from '@/components/shared/StatsCard';
import { Table } from '@/components/shared/Table';
import { Badge } from '@/components/shared/Badge';
import { SalesChart } from '@/components/shared/SalesChart';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import '../../styles/finance-responsive.css';

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

const periodOptions = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'week', label: 'Minggu Ini' },
  { value: 'month', label: 'Bulan Ini' },
  { value: '6months', label: '6 Bulan Terakhir' },
  { value: '1year', label: '1 Tahun Terakhir' },
];

const FLAT_SERIES = ['#97764D', '#232D36', '#6B7881', '#7D6240', '#161D24', '#C7BBAB'];

function getDateRange(period: string): { start: string; end: string } {
  const today = new Date('2026-09-15');
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  switch (period) {
    case 'today': {
      const s = formatDate(today);
      return { start: s, end: s };
    }
    case 'week': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { start: formatDate(start), end: formatDate(today) };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return { start: formatDate(start), end: formatDate(end) };
    }
    case '6months': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 6);
      return { start: formatDate(start), end: formatDate(today) };
    }
    case '1year': {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return { start: formatDate(start), end: formatDate(today) };
    }
    default:
      return { start: '2026-01-01', end: '2026-09-15' };
  }
}

export default function SalesPage() {
  const [period, setPeriod] = useState('month');
  const allSales = salesService.getAll();
  const allExpenses = expenseService.getAll();

  const { start, end } = getDateRange(period);

  const filteredSales = useMemo(() =>
    allSales.filter((s) => s.date >= start && s.date <= end),
    [allSales, start, end]
  );
  const filteredExpenses = useMemo(() =>
    allExpenses.filter((e) => e.date >= start && e.date <= end),
    [allExpenses, start, end]
  );

  const totalSales = filteredSales.reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netRevenue = totalSales - totalExpenses;
  const totalTransactions = filteredSales.length;
  const avgPerTransaction = totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0;
  const sourceBreakdown = useMemo(() => {
    const sourceMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    filteredSales.forEach((s) => {
      sourceMap[s.source] = (sourceMap[s.source] || 0) + s.amount;
      countMap[s.source] = (countMap[s.source] || 0) + 1;
    });
    const total = filteredSales.reduce((sum, s) => sum + s.amount, 0);
    return Object.entries(sourceMap).map(([source, totalSales], index) => ({
      source,
      label: reservationSourceLabels[source] || source,
      color: FLAT_SERIES[index % FLAT_SERIES.length],
      totalSales,
      count: countMap[source] || 0,
      percentage: total > 0 ? Math.round((totalSales / total) * 100) : 0,
    }));
  }, [filteredSales]);

  const monthlyData = useMemo(() => {
    const monthMap: Record<string, { sales: number; expenses: number }> = {};
    filteredSales.forEach((s) => {
      const month = s.date.substring(0, 7);
      monthMap[month] = { sales: (monthMap[month]?.sales || 0) + s.amount, expenses: 0 };
    });
    filteredExpenses.forEach((e) => {
      const month = e.date.substring(0, 7);
      monthMap[month] = { sales: monthMap[month]?.sales || 0, expenses: (monthMap[month]?.expenses || 0) + e.amount };
    });
    return Object.entries(monthMap).map(([month, data]) => ({ month, ...data })).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredSales, filteredExpenses]);

  const stats = [
    { label: 'Total Sales', value: formatCurrency(totalSales), icon: <Banknote size={28} />, color: '#97764D', subtitle: `${totalTransactions} transaksi` },
    { label: 'Total Expenses', value: formatCurrency(totalExpenses), icon: <TrendingDown size={28} />, color: '#6B7881', subtitle: 'Total biaya' },
    { label: 'Net Revenue', value: formatCurrency(netRevenue), icon: <Wallet size={28} />, color: '#232D36', subtitle: 'Sales - Expenses' },
    { label: 'Avg/Transaction', value: formatCurrency(avgPerTransaction), icon: <ReceiptText size={28} />, color: '#6B7881', subtitle: 'Rata-rata' },
  ];

  const sourceColumns = [
    {
      key: 'label',
      header: 'Sumber',
      render: (item: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: item.color }} />
          <span style={{ fontWeight: 600 }}>{item.label}</span>
        </div>
      ),
    },
    { key: 'count', header: 'Transaksi', render: (item: any) => item.count },
    { key: 'totalSales', header: 'Total', render: (item: any) => formatCurrency(item.totalSales) },
    { key: 'percentage', header: 'Persentase', render: (item: any) => `${item.percentage}%` },
  ];

  const salesColumns = [
    { key: 'date', header: 'Date', render: (item: any) => item.date },
    { key: 'source', header: 'Sumber', render: (item: any) => <Badge variant="default">{reservationSourceLabels[item.source] || item.source}</Badge> },
    { key: 'description', header: 'Deskripsi', render: (item: any) => item.description },
    { key: 'amount', header: 'Amount', render: (item: any) => formatCurrency(item.amount) },
  ];

  return (
    <div className="fin-page">
      <h1 className="fin-h1">Sales & Revenue</h1>

      <Card style={{ marginBottom: '20px' }}>
        <div className="fin-pills">
          <span className="fin-pills__label">Filter Periode:</span>
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {stats.map((stat) => (
          <StatsCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} subtitle={stat.subtitle} />
        ))}
      </div>

      <div className="fin-grid-2">
        <Card>
          <h3 className="fin-h3">Revenue by Source</h3>
          <Table columns={sourceColumns} data={sourceBreakdown} emptyMessage="Tidak ada data sumber" />
        </Card>

        <Card>
          <h3 className="fin-h3">Sales vs Expenses (Bulanan)</h3>
          <SalesChart data={monthlyData} formatCurrency={formatCurrency} emptyMessage="Tidak ada data" />
        </Card>
      </div>

      <Card>
        <h3 className="fin-h3">Riwayat Transaksi</h3>
        <Table columns={salesColumns} data={filteredSales} emptyMessage="Tidak ada transaksi untuk periode ini" />
      </Card>
    </div>
  );
}
