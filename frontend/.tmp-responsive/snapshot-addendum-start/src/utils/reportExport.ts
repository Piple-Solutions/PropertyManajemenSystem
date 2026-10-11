import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Single filtered dataset shared by screen, print, Excel and PDF outputs. */
export interface ReportDataset {
  startDate: string;
  endDate: string;
  periodLabel: string;
  generatedAt: string;
  totalSales: number;
  totalExpenses: number;
  netRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  expenseByCategory: Array<{ category: string; label: string; amount: number }>;
  includedCategories: string[];
  excludedCategories: string[];
  sales: Array<{ date: string; source: string; sourceLabel: string; description: string; amount: number }>;
  expenses: Array<{ date: string; category: string; categoryLabel: string; description: string; amount: number }>;
  invoices: Array<{ invoiceNumber: string; guestName: string; invoiceStatus: string; paymentStatus: string; total: number }>;
}

function fileBase(ds: ReportDataset): string {
  return `financial-report-${ds.startDate}_to_${ds.endDate}`;
}

function categorySummary(ds: ReportDataset): { included: string; excluded: string } {
  return {
    included: `${ds.includedCategories.length} of ${ds.includedCategories.length + ds.excludedCategories.length} included`,
    excluded: ds.excludedCategories.length > 0 ? ds.excludedCategories.join(', ') : '—',
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReportExcel(ds: ReportDataset): void {
  const wb = XLSX.utils.book_new();

  const summaryRows: Array<[string, string | number]> = [
    ['Financial Report', ''],
    ['Period', ds.periodLabel],
    ['Start Date', ds.startDate],
    ['End Date', ds.endDate],
    ['Generated', ds.generatedAt],
    ['Expense Categories', categorySummary(ds).included],
    ['Excluded Categories', categorySummary(ds).excluded],
    ['', ''],
    ['Total Sales', ds.totalSales],
    ['Total Expenses', ds.totalExpenses],
    ['Net Revenue', ds.netRevenue],
    ['Total Invoices', ds.totalInvoices],
    ['Paid Invoices', ds.paidInvoices],
    ['Pending Invoices', ds.pendingInvoices],
    ['Overdue Invoices', ds.overdueInvoices],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const categoryRows = ds.expenseByCategory.map((c) => ({ Category: c.label, Amount: c.amount }));
  const categorySheet = XLSX.utils.json_to_sheet(categoryRows.length > 0 ? categoryRows : [{ Category: '', Amount: 0 }]);
  categorySheet['!cols'] = [{ wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, categorySheet, 'Expenses by Category');

  const salesRows = ds.sales.map((s) => ({ Date: s.date, Source: s.sourceLabel, Description: s.description, Amount: s.amount }));
  const salesSheet = XLSX.utils.json_to_sheet(salesRows.length > 0 ? salesRows : [{ Date: '', Source: '', Description: '', Amount: 0 }]);
  salesSheet['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales');

  const expenseRows = ds.expenses.map((e) => ({ Date: e.date, Category: e.categoryLabel, Description: e.description, Amount: e.amount }));
  const expenseSheet = XLSX.utils.json_to_sheet(expenseRows.length > 0 ? expenseRows : [{ Date: '', Category: '', Description: '', Amount: 0 }]);
  expenseSheet['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Expenses');

  const invoiceRows = ds.invoices.map((inv) => ({
    InvoiceNumber: inv.invoiceNumber,
    Guest: inv.guestName,
    InvoiceStatus: inv.invoiceStatus,
    PaymentStatus: inv.paymentStatus,
    Total: inv.total,
  }));
  const invoiceSheet = XLSX.utils.json_to_sheet(
    invoiceRows.length > 0 ? invoiceRows : [{ InvoiceNumber: '', Guest: '', InvoiceStatus: '', PaymentStatus: '', Total: 0 }],
  );
  invoiceSheet['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, invoiceSheet, 'Invoices');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(ds)}.xlsx`);
}

function formatIDR(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export function exportReportPDF(ds: ReportDataset): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = margin;

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(107, 120, 129);
      doc.text(`Homestay Joglo Seruni Syariah · Financial Report · ${ds.periodLabel}`, margin, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(35, 45, 54);
  doc.text('Homestay Joglo Seruni Syariah', margin, cursorY);
  doc.setFontSize(18);
  doc.text('Financial Report', margin, cursorY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 120, 129);
  doc.text(`Period: ${ds.periodLabel} (${ds.startDate} to ${ds.endDate})`, margin, cursorY + 14);
  doc.text(`Generated: ${ds.generatedAt}`, margin, cursorY + 19);
  cursorY += 26;

  autoTable(doc, {
    startY: cursorY,
    head: [['Summary', 'Value']],
    body: [
      ['Total Sales', formatIDR(ds.totalSales)],
      ['Total Expenses', formatIDR(ds.totalExpenses)],
      ['Net Revenue', formatIDR(ds.netRevenue)],
      ['Expense Categories', categorySummary(ds).included],
      ['Excluded Categories', categorySummary(ds).excluded],
      ['Total Invoices', String(ds.totalInvoices)],
      ['Paid Invoices', String(ds.paidInvoices)],
      ['Pending Invoices', String(ds.pendingInvoices)],
      ['Overdue Invoices', String(ds.overdueInvoices)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [35, 45, 54] },
    margin: { left: margin, right: margin },
  });
  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: cursorY,
    head: [['Expense Category', 'Amount']],
    body: ds.expenseByCategory.length > 0
      ? ds.expenseByCategory.map((c) => [c.label, formatIDR(c.amount)])
      : [['No expenses for this period', '—']],
    theme: 'grid',
    headStyles: { fillColor: [151, 118, 77] },
    margin: { left: margin, right: margin },
  });
  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: cursorY,
    head: [['Date', 'Source', 'Description', 'Amount']],
    body: ds.sales.length > 0
      ? ds.sales.map((s) => [s.date, s.sourceLabel, s.description, formatIDR(s.amount)])
      : [['—', '—', 'No sales for this period', '—']],
    theme: 'grid',
    headStyles: { fillColor: [35, 45, 54] },
    columnStyles: { 3: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });
  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: cursorY,
    head: [['Date', 'Category', 'Description', 'Amount']],
    body: ds.expenses.length > 0
      ? ds.expenses.map((e) => [e.date, e.categoryLabel, e.description, formatIDR(e.amount)])
      : [['—', '—', 'No expenses for this period', '—']],
    theme: 'grid',
    headStyles: { fillColor: [35, 45, 54] },
    columnStyles: { 3: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });
  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: cursorY,
    head: [['Invoice', 'Guest', 'Status', 'Payment', 'Total']],
    body: ds.invoices.length > 0
      ? ds.invoices.map((inv) => [inv.invoiceNumber, inv.guestName, inv.invoiceStatus, inv.paymentStatus, formatIDR(inv.total)])
      : [['—', '—', '—', '—', 'No invoices for this period']],
    theme: 'grid',
    headStyles: { fillColor: [35, 45, 54] },
    columnStyles: { 4: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  addFooter();
  doc.save(`${fileBase(ds)}.pdf`);
}
