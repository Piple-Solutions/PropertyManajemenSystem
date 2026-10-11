interface CategoryDatum {
  category: string;
  label: string;
  amount: number;
  color: string;
}

interface ExpenseChartProps {
  data: CategoryDatum[];
  total: number;
  formatCurrency: (val: number) => string;
  emptyMessage?: string;
}

export function ExpenseChart({ data, total, formatCurrency, emptyMessage = 'Tidak ada pengeluaran' }: ExpenseChartProps) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#6B7881', padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px' }}>{emptyMessage}</div>;
  }

  const maxAmount = Math.max(...data.map((e) => e.amount), 1);
  const summary = `Expenses by category across ${data.length} categories, total ${formatCurrency(total)}. Largest: ${data[0].label} ${formatCurrency(data[0].amount)}.`;

  return (
    <div role="img" aria-label={summary} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {data.map((item) => (
        <div key={item.category} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
<span style={{ fontSize: '14px', color: '#232D36', width: '100px' }}>{item.label}</span>
           <div style={{ flex: 1, height: '8px', backgroundColor: '#EEEDE9', border: '1px solid #C7BBAB', borderRadius: '999px', overflow: 'hidden' }}>
             <div style={{ width: `${(item.amount / maxAmount) * 100}%`, height: '100%', backgroundColor: item.color, borderRadius: '999px' }} />
           </div>
           <span style={{ fontSize: '14px', fontWeight: 600, color: '#232D36', width: '100px', textAlign: 'right' }}>{formatCurrency(item.amount)}</span>
        </div>
      ))}
       <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #C7BBAB', display: 'flex', justifyContent: 'space-between' }}>
         <span style={{ fontWeight: 700, color: '#232D36' }}>Total Pengeluaran</span>
         <span style={{ fontWeight: 700, color: '#232D36' }}>{formatCurrency(total)}</span>
       </div>
    </div>
  );
}
