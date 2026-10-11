import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  density?: 'comfortable' | 'compact';
  headerStyle?: React.CSSProperties;
  selectedId?: string | null;
}

export function Table<T extends { id: string }>({
  columns,
  data,
  loading = false,
  onRowClick,
  emptyMessage = 'No data available',
  density = 'comfortable',
  headerStyle,
  selectedId,
}: TableProps<T>) {
  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6B7881' }}>Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6B7881', backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px' }}>
        {emptyMessage}
      </div>
    );
  }

  const cellPad = density === 'compact' ? '6px 8px' : '12px 16px';
  const headFont = density === 'compact' ? '11px' : '12px';
  const bodyFont = density === 'compact' ? '13px' : '14px';

  return (
    <div className="tbl-wrap" style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #C7BBAB', backgroundColor: '#FFFFFF', maxWidth: '100%' }}>
      <table
        className="tbl"
        style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ['--tbl-cols' as string]: columns.length } as React.CSSProperties}
      >
        <thead>
          <tr style={{ backgroundColor: headerStyle?.backgroundColor || '#97764D' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: cellPad,
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: headFont,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: headerStyle?.color || '#FFFFFF',
                  borderBottom: '1px solid #C7BBAB',
                  overflowWrap: 'break-word',
                  ...headerStyle,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const isSelected = selectedId === item.id;
            const baseBg = isSelected ? '#E9E6E0' : index % 2 === 0 ? '#FFFFFF' : '#F2F0EB';
            return (
            <tr
              key={item.id || index}
              data-room-row={item.id}
              onClick={() => onRowClick?.(item)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onRowClick(item);
                }
              }}
              tabIndex={onRowClick ? 0 : undefined}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                backgroundColor: baseBg,
                outline: isSelected ? '2px solid #97764D' : 'none',
                outlineOffset: isSelected ? '-2px' : undefined,
                transition: 'background-color 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#E9E6E0';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = baseBg;
                }
              }}
              onFocus={(e) => {
                if (onRowClick) {
                  (e.currentTarget as HTMLElement).style.outline = '2px solid #97764D';
                  (e.currentTarget as HTMLElement).style.outlineOffset = '-2px';
                }
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.outline = isSelected ? '2px solid #97764D' : 'none';
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: cellPad,
                    borderBottom: '1px solid #E3DED6',
                    fontSize: bodyFont,
                    color: '#232D36',
                    textAlign: 'center',
                    overflowWrap: 'break-word',
                  }}
                >
                  {col.render ? col.render(item) : (item as any)[col.key]}
                </td>
              ))}
             </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
