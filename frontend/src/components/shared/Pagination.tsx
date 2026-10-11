import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  pageSize = 10,
  pageSizeOptions = [8, 16],
  onPageSizeChange,
}: PaginationProps) {
  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    const delta = 2;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '16px',
    marginBottom: '24px',
    fontFamily: 'var(--font-family-sans)',
    flexWrap: 'wrap',
  };

  const pageButtonStyles = (isActive: boolean, isDisabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '40px',
    height: '40px',
    padding: '0 8px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: isActive ? '#232D36' : '#C7BBAB',
    backgroundColor: isActive ? '#232D36' : '#FFFFFF',
    color: isActive ? '#FFFFFF' : isDisabled ? '#6B7881' : '#232D36',
    fontSize: '14px',
    fontWeight: isActive ? 600 : 400,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'all 150ms ease',
    fontFamily: 'var(--font-family-sans)',
  });

  return (
    <div className="pg" style={containerStyles}>
      <button
        style={pageButtonStyles(false, currentPage === 1)}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        ←
      </button>
      {getVisiblePages().map((page, index) => {
        if (typeof page === 'string') {
          return (
            <span key={`ellipsis-${index}`} style={{
              width: '40px',
              height: '40px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B7881',
              fontSize: '14px',
            }}>
              ...
            </span>
          );
        }
        return (
          <button
            key={page}
            style={pageButtonStyles(page === currentPage, false)}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        );
      })}
      <button
        style={pageButtonStyles(false, currentPage === totalPages)}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        →
      </button>
      {onPageSizeChange && totalItems && (
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          style={{
            marginLeft: '12px',
            padding: '8px',
            borderRadius: '8px',
            border: '1px solid #C7BBAB',
            backgroundColor: '#FFFFFF',
            fontSize: '14px',
            color: '#232D36',
            fontFamily: 'var(--font-family-sans)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}/page</option>
          ))}
        </select>
      )}
    </div>
  );
}
