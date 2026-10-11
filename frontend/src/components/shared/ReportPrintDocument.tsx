import type { ReportDataset } from '@/utils/reportExport';

function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

/**
 * Print-only A4 financial report. Rendered inside `.report-print-area`
 * (hidden on screen, visible in print via report-print.css).
 * Consumes the same filtered ReportDataset as screen, Excel and PDF outputs.
 */
export function ReportPrintDocument({ dataset }: { dataset: ReportDataset }) {
  const ds = dataset;

  return (
    <div className="report-print">
      <header className="report-print__header">
        <div>
          <div className="report-print__brand">Homestay Joglo Seruni Syariah</div>
          <div className="report-print__sub">Hotel Property Management System</div>
        </div>
        <div className="report-print__titleblock">
          <div className="report-print__title">FINANCIAL REPORT</div>
          <div className="report-print__period">{ds.periodLabel}</div>
        </div>
      </header>

      <div className="report-print__meta">
        <span>Period: {ds.startDate} to {ds.endDate}</span>
        <span>Generated: {ds.generatedAt}</span>
      </div>
      <div className="report-print__meta">
        <span>Expense categories: {ds.includedCategories.length} of {ds.includedCategories.length + ds.excludedCategories.length} included</span>
        <span>Excluded: {ds.excludedCategories.length > 0 ? ds.excludedCategories.join(', ') : '—'}</span>
      </div>

      <section className="report-print__section">
        <div className="report-print__sectiontitle">Summary</div>
        <table className="report-print__table">
          <tbody>
            <tr><td>Total Sales</td><td style={{ textAlign: 'right' }}>{formatIDR(ds.totalSales)}</td></tr>
            <tr><td>Total Expenses</td><td style={{ textAlign: 'right' }}>{formatIDR(ds.totalExpenses)}</td></tr>
            <tr><td>Net Revenue</td><td style={{ textAlign: 'right' }}><strong>{formatIDR(ds.netRevenue)}</strong></td></tr>
            <tr><td>Total Invoices</td><td style={{ textAlign: 'right' }}>{ds.totalInvoices}</td></tr>
            <tr><td>Paid / Pending / Overdue</td><td style={{ textAlign: 'right' }}>{ds.paidInvoices} / {ds.pendingInvoices} / {ds.overdueInvoices}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-print__section">
        <div className="report-print__sectiontitle">Expenses by Category</div>
        <table className="report-print__table">
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {ds.expenseByCategory.length > 0 ? ds.expenseByCategory.map((c) => (
              <tr key={c.category}><td>{c.label}</td><td style={{ textAlign: 'right' }}>{formatIDR(c.amount)}</td></tr>
            )) : (
              <tr><td colSpan={2}>No expenses for this period</td></tr>
            )}
            <tr><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{formatIDR(ds.totalExpenses)}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-print__section">
        <div className="report-print__sectiontitle">Sales</div>
        <table className="report-print__table">
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Date</th><th style={{ textAlign: 'left' }}>Source</th><th style={{ textAlign: 'left' }}>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {ds.sales.length > 0 ? ds.sales.map((s, i) => (
              <tr key={`${s.date}-${i}`}><td>{s.date}</td><td>{s.sourceLabel}</td><td>{s.description}</td><td style={{ textAlign: 'right' }}>{formatIDR(s.amount)}</td></tr>
            )) : (
              <tr><td colSpan={4}>No sales for this period</td></tr>
            )}
            <tr><td colSpan={3}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{formatIDR(ds.totalSales)}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-print__section">
        <div className="report-print__sectiontitle">Expenses</div>
        <table className="report-print__table">
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Date</th><th style={{ textAlign: 'left' }}>Category</th><th style={{ textAlign: 'left' }}>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {ds.expenses.length > 0 ? ds.expenses.map((e, i) => (
              <tr key={`${e.date}-${i}`}><td>{e.date}</td><td>{e.categoryLabel}</td><td>{e.description}</td><td style={{ textAlign: 'right' }}>{formatIDR(e.amount)}</td></tr>
            )) : (
              <tr><td colSpan={4}>No expenses for this period</td></tr>
            )}
            <tr><td colSpan={3}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{formatIDR(ds.totalExpenses)}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-print__section">
        <div className="report-print__sectiontitle">Invoices</div>
        <table className="report-print__table">
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Invoice</th><th style={{ textAlign: 'left' }}>Guest</th><th style={{ textAlign: 'left' }}>Status</th><th style={{ textAlign: 'left' }}>Payment</th><th style={{ textAlign: 'right' }}>Total</th></tr>
          </thead>
          <tbody>
            {ds.invoices.length > 0 ? ds.invoices.map((inv) => (
              <tr key={inv.invoiceNumber}><td>{inv.invoiceNumber}</td><td>{inv.guestName}</td><td>{inv.invoiceStatus}</td><td>{inv.paymentStatus}</td><td style={{ textAlign: 'right' }}>{formatIDR(inv.total)}</td></tr>
            )) : (
              <tr><td colSpan={5}>No invoices for this period</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="report-print__footer">
        <div>Generated on {ds.generatedAt} · Homestay Joglo Seruni Syariah</div>
      </footer>
    </div>
  );
}
