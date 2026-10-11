interface MonthlyDatum {
  month: string;
  sales: number;
  expenses: number;
  net?: number;
}

interface SalesChartProps {
  data: MonthlyDatum[];
  formatCurrency: (val: number) => string;
  emptyMessage?: string;
}

export function SalesChart({ data, formatCurrency, emptyMessage = 'Tidak ada data' }: SalesChartProps) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#6B7881', padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px' }}>{emptyMessage}</div>;
  }

  const maxValue = Math.max(...data.map((d) => Math.max(d.sales, d.expenses)), 1);
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);
  const summary = `Monthly sales versus expenses for ${data.length} month(s), total sales ${formatCurrency(totalSales)}.`;

  return (
    <div role="img" aria-label={summary} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((d) => (
        <div key={d.month} className="sc-row">
          <span className="sc-label" style={{ fontSize: '12px', color: '#6B7881', fontWeight: 600 }}>{d.month}</span>
          <div className="sc-bars">
<div style={{ flex: d.sales / maxValue, height: '20px', backgroundColor: '#97764D', borderRadius: '4px', minWidth: d.sales > 0 ? '4px' : '0px' }}
               title={`Sales: ${formatCurrency(d.sales)}`}
             />
             <div
               style={{ flex: d.expenses / maxValue, height: '20px', backgroundColor: '#6B7881', borderRadius: '4px', minWidth: d.expenses > 0 ? '4px' : '0px' }}
              title={`Expenses: ${formatCurrency(d.expenses)}`}
            />
          </div>
<span className="sc-value" style={{ fontSize: '11px', color: '#232D36' }}>
             {d.net !== undefined ? `Net: ${formatCurrency(d.net)}` : formatCurrency(d.sales)}
           </span>
        </div>
      ))}
       <div className="sc-legend" style={{ fontSize: '12px', color: '#232D36' }}>
         <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#97764D', borderRadius: '4px', marginRight: '4px', verticalAlign: 'middle' }} /> Penjualan</span>
         <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#6B7881', borderRadius: '4px', marginRight: '4px', verticalAlign: 'middle' }} /> Pengeluaran</span>
      </div>
    </div>
  );
}
