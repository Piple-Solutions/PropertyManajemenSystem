import { useState, useMemo } from 'react';
import { Banknote, TrendingDown, Wallet, ReceiptText, Printer, Download, FileText } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { StatsCard } from '@/components/shared/StatsCard';
import { Table } from '@/components/shared/Table';
import { Badge } from '@/components/shared/Badge';
import { SalesChart } from '@/components/shared/SalesChart';
import { ExpenseChart } from '@/components/shared/ExpenseChart';
import { ReportPrintDocument } from '@/components/shared/ReportPrintDocument';
import { invoiceService } from '@/services/invoiceService';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { expenseCategoryLabels, expenseCategories } from '@/constants/expenseCategories';
import { reservationSourceLabels } from '@/constants/reservationStatuses';
import { exportReportExcel, exportReportPDF, type ReportDataset } from '@/utils/reportExport';
import '../../styles/finance-responsive.css';
import '../../styles/report-print.css';

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

const periodOptions = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'week', label: 'Minggu Ini' },
  { value: 'month', label: 'Bulan Ini' },
  { value: '6months', label: '6 Bulan' },
  { value: '1year', label: '1 Tahun' },
];

const FLAT_SERIES = ['#97764D', '#232D36', '#6B7881', '#7D6240', '#161D24', '#C7BBAB'];

function getDateRange(period: string): { start: string; end: string } {
  const today = new Date('2026-09-15');
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  switch (period) {
    case 'today': { const s = formatDate(today); return { start: s, end: s }; }
    case 'week': { const start = new Date(today); start.setDate(start.getDate() - 7); return { start: formatDate(start), end: formatDate(today) }; }
    case 'month': { const start = new Date(today.getFullYear(), today.getMonth(), 1); const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()); return { start: formatDate(start), end: formatDate(end) }; }
    case '6months': { const start = new Date(today); start.setMonth(start.getMonth() - 6); return { start: formatDate(start), end: formatDate(today) }; }
    case '1year': { const start = new Date(today); start.setFullYear(start.getFullYear() - 1); return { start: formatDate(start), end: formatDate(today) }; }
    default: return { start: '2026-01-01', end: '2026-09-15' };
  }
}

export default function ReportPage() {
  const [period, setPeriod] = useState('month');
  const preset = getDateRange(period === 'custom' ? 'month' : period);
  const [startDate, setStartDate] = useState(preset.start);
  const [endDate, setEndDate] = useState(preset.end);
  const [includedCategories, setIncludedCategories] = useState<string[]>([...expenseCategories]);

  const applyPreset = (value: string) => {
    const range = getDateRange(value);
    setPeriod(value);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleStartChange = (value: string) => {
    setPeriod('custom');
    setStartDate(value);
  };

  const handleEndChange = (value: string) => {
    setPeriod('custom');
    setEndDate(value);
  };

  const toggleCategory = (category: string) => {
    setIncludedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const selectAllCategories = () => setIncludedCategories([...expenseCategories]);
  const clearAllCategories = () => setIncludedCategories([]);

  const start = startDate;
  const end = endDate;
  const rangeError = start && end && start > end ? 'Start date must be on or before the end date.' : null;

  const allSales = salesService.getAll();
  const allExpenses = expenseService.getAll();
  const allInvoices = invoiceService.getAll();

  const filteredSales = useMemo(() => {
    if (rangeError) return [];
    return allSales.filter((s) => s.date >= start && s.date <= end);
  }, [allSales, start, end, rangeError]);
  const filteredExpenses = useMemo(() => {
    if (rangeError) return [];
    return allExpenses.filter((e) => e.date >= start && e.date <= end && includedCategories.includes(e.category));
  }, [allExpenses, start, end, rangeError, includedCategories]);
  const filteredInvoices = useMemo(() => {
    if (rangeError) return [];
    return allInvoices.filter((inv) => {
      const d = new Date(inv.invoiceDate);
      return d >= new Date(start) && d <= new Date(end);
    });
  }, [allInvoices, start, end, rangeError]);

  const totalSales = filteredSales.reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netRevenue = totalSales - totalExpenses;
  const totalInvoices = filteredInvoices.length;
  const paidInvoices = filteredInvoices.filter((inv) => inv.invoiceStatus === 'Completed').length;
  const pendingInvoices = filteredInvoices.filter((inv) => inv.invoiceStatus === 'Draft').length;
  const overdueInvoices = filteredInvoices.filter((inv) => inv.paymentStatus === 'Overdue').length;

  const expenseByCategory = useMemo(() => {
    const catMap: Record<string, number> = {};
    filteredExpenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    return Object.entries(catMap)
      .map(([category, amount], index) => ({ category, amount, label: expenseCategoryLabels[category] || category, color: FLAT_SERIES[index % FLAT_SERIES.length] }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const stats = [
    { label: 'Total Sales', value: formatCurrency(totalSales), icon: <Banknote size={28} />, color: '#97764D' },
    { label: 'Total Expenses', value: formatCurrency(totalExpenses), icon: <TrendingDown size={28} />, color: '#6B7881' },
    { label: 'Net Revenue', value: formatCurrency(netRevenue), icon: <Wallet size={28} />, color: '#232D36' },
    { label: 'Total Invoices', value: totalInvoices, icon: <ReceiptText size={28} />, color: '#6B7881' },
  ];

  const monthlyData = useMemo(() => {
    const monthMap: Record<string, { sales: number; expenses: number; net: number }> = {};
    filteredSales.forEach((s) => {
      const month = s.date.substring(0, 7);
      monthMap[month] = { sales: (monthMap[month]?.sales || 0) + s.amount, expenses: 0, net: 0 };
    });
    filteredExpenses.forEach((e) => {
      const month = e.date.substring(0, 7);
      monthMap[month] = { sales: monthMap[month]?.sales || 0, expenses: (monthMap[month]?.expenses || 0) + e.amount, net: 0 };
    });
    return Object.entries(monthMap).map(([month, d]) => ({ month, ...d, net: d.sales - d.expenses })).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredSales, filteredExpenses]);

  const periodLabel = period === 'custom'
    ? (start && end ? `${start} to ${end}` : 'Custom period')
    : (periodOptions.find((o) => o.value === period)?.label || `${start} to ${end}`);

  const dataset: ReportDataset = useMemo(() => ({
    startDate: start,
    endDate: end,
    periodLabel,
    generatedAt: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    totalSales,
    totalExpenses,
    netRevenue,
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
    expenseByCategory: expenseByCategory.map((c) => ({ category: c.category, label: c.label, amount: c.amount })),
    includedCategories: [...includedCategories],
    excludedCategories: expenseCategories.filter((c) => !includedCategories.includes(c)),
    sales: filteredSales.map((s: any) => ({
      date: s.date,
      source: s.source,
      sourceLabel: reservationSourceLabels[s.source] || s.source,
      description: s.description,
      amount: s.amount,
    })),
    expenses: filteredExpenses.map((e) => ({
      date: e.date,
      category: e.category,
      categoryLabel: expenseCategoryLabels[e.category] || e.category,
      description: e.description,
      amount: e.amount,
    })),
    invoices: filteredInvoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      guestName: inv.guestName,
      invoiceStatus: inv.invoiceStatus,
      paymentStatus: inv.paymentStatus,
      total: inv.total,
    })),
  }), [start, end, periodLabel, totalSales, totalExpenses, netRevenue, totalInvoices, paidInvoices, pendingInvoices, overdueInvoices, expenseByCategory, filteredSales, filteredExpenses, filteredInvoices, includedCategories]);

  return (
    <div className="fin-page">
      <div className="fin-head" style={{ marginBottom: '20px' }}>
        <h1 className="fin-h1" style={{ marginBottom: 0 }}>Laporan Keuangan</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => window.print()} aria-label="Print report as PDF">
            <Printer size={14} aria-hidden="true" /> Print PDF
          </Button>
          <Button variant="outline" onClick={() => exportReportExcel(dataset)} aria-label="Export report as Excel">
            <Download size={14} aria-hidden="true" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => exportReportPDF(dataset)} aria-label="Export report as PDF">
            <FileText size={14} aria-hidden="true" /> Export PDF
          </Button>
        </div>
      </div>

      <Card style={{ marginBottom: '20px' }}>
        <div className="fin-pills" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <span className="fin-pills__label">Filter Periode:</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {periodOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={period === opt.value ? 'primary' : 'outline'}
                size="sm"
                onClick={() => applyPreset(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
          <Input label="Start Date" type="date" value={startDate} onChange={(e) => handleStartChange(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={(e) => handleEndChange(e.target.value)} />
        </div>
        {rangeError && (
          <p role="alert" style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#962222' }}>{rangeError}</p>
        )}
        {!rangeError && (
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6B7881' }}>
            Showing report for {start} to {end}
          </p>
        )}
        <div style={{ marginTop: '16px', borderTop: '1px solid #C7BBAB', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span className="fin-pills__label">Expense Categories:</span>
            <span style={{ fontSize: '13px', color: '#6B7881' }}>
              {includedCategories.length} of {expenseCategories.length} included
            </span>
            <span style={{ display: 'inline-flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              <Button size="sm" variant="outline" onClick={selectAllCategories}>Select all</Button>
              <Button size="sm" variant="outline" onClick={clearAllCategories}>Clear all</Button>
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', border: '1px solid #C7BBAB', borderRadius: '8px', padding: '12px', backgroundColor: '#FFFFFF' }}>
            {expenseCategories.map((category) => (
              <label
                key={category}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#232D36', cursor: 'pointer', padding: '8px 4px', minHeight: '44px' }}
              >
                <input
                  type="checkbox"
                  checked={includedCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  aria-label={`Include ${expenseCategoryLabels[category] || category} in report`}
                  style={{ width: '18px', height: '18px', accentColor: '#97764D' }}
                />
                {expenseCategoryLabels[category] || category}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {stats.map((stat) => (
          <StatsCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} />
        ))}
      </div>

      <div className="fin-grid-2">
        <Card>
          <h3 className="fin-h3">Ringkasan</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #C7BBAB' }}>
              <span style={{ color: '#6B7881' }}>Total Penjualan</span>
              <span style={{ fontWeight: 700, color: '#232D36' }}>{formatCurrency(totalSales)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #C7BBAB' }}>
              <span style={{ color: '#6B7881' }}>Total Pengeluaran</span>
              <span style={{ fontWeight: 700, color: '#232D36' }}>{formatCurrency(totalExpenses)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #C7BBAB' }}>
              <span style={{ color: '#6B7881' }}>Invoice Lunas</span>
              <span style={{ fontWeight: 700, color: '#2F5D37' }}>{paidInvoices}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #C7BBAB' }}>
              <span style={{ color: '#6B7881' }}>Invoice Tertunda</span>
              <span style={{ fontWeight: 700, color: '#7A5A1E' }}>{pendingInvoices}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ color: '#6B7881' }}>Invoice Overdue</span>
              <span style={{ fontWeight: 700, color: '#962222' }}>{overdueInvoices}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '2px solid #C7BBAB', marginTop: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#232D36' }}>Net Revenue</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: netRevenue >= 0 ? '#2F5D37' : '#962222' }}>{formatCurrency(netRevenue)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="fin-h3">Tren Penjualan vs Pengeluaran</h3>
          <SalesChart data={monthlyData} formatCurrency={formatCurrency} emptyMessage="Tidak ada data" />
        </Card>
      </div>

      <div className="fin-grid-2">
        <Card>
          <h3 className="fin-h3">Pengeluaran per Kategori</h3>
          <ExpenseChart data={expenseByCategory} total={totalExpenses} formatCurrency={formatCurrency} emptyMessage="Tidak ada pengeluaran" />
        </Card>

        <Card>
          <h3 className="fin-h3">Ringkasan Invoice</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: '#E3EDE4', border: '1px solid #C7BBAB', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#2F5D37' }}>{paidInvoices}</div>
              <div style={{ fontSize: '12px', color: '#6B7881' }}>Lunas</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F0E7D3', border: '1px solid #C7BBAB', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#7A5A1E' }}>{pendingInvoices}</div>
              <div style={{ fontSize: '12px', color: '#6B7881' }}>Tertunda</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#F3DEDE', border: '1px solid #C7BBAB', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#962222' }}>{overdueInvoices}</div>
              <div style={{ fontSize: '12px', color: '#6B7881' }}>Overdue</div>
            </div>
          </div>
          {filteredInvoices.length > 0 && (
            <Table
              columns={[
                { key: 'invoiceNumber', header: 'Nomor', render: (item: any) => <span style={{ fontWeight: 600 }}>{item.invoiceNumber}</span> },
                { key: 'guestName', header: 'Tamu', render: (item: any) => item.guestName },
                { key: 'invoiceStatus', header: 'Status', render: (item: any) => <Badge variant={item.invoiceStatus === 'Completed' ? 'success' : item.invoiceStatus === 'Cancelled' ? 'danger' : item.invoiceStatus === 'Sent' ? 'info' : 'default'}>{item.invoiceStatus}</Badge> },
                { key: 'total', header: 'Total', render: (item: any) => formatCurrency(item.total) },
              ]}
              data={filteredInvoices.slice(0, 5)}
              emptyMessage="Tidak ada invoice"
            />
          )}
        </Card>
      </div>

      <Card>
        <h3 className="fin-h3">Detail Penjualan</h3>
        <Table
          columns={[
            { key: 'date', header: 'Date' },
            { key: 'source', header: 'Sumber', render: (item: any) => <Badge variant="default">{reservationSourceLabels[item.source] || item.source}</Badge> },
            { key: 'description', header: 'Deskripsi' },
            { key: 'amount', header: 'Amount', render: (item: any) => formatCurrency(item.amount) },
          ]}
          data={filteredSales}
          emptyMessage="Tidak ada data penjualan untuk periode ini"
        />
      </Card>

      <div className="report-print-area" aria-hidden="true">
        <ReportPrintDocument dataset={dataset} />
      </div>
    </div>
  );
}
