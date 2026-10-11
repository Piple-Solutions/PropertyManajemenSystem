import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error = false,
    options = [],
    placeholder = 'Pilih...',
    className = '',
    style,
    ...props
  }: SelectProps,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  const selectStyles: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-family-sans)',
    backgroundColor: '#FFFFFF',
    border: `1px solid ${error ? '#962222' : '#C7BBAB'}`,
    borderRadius: '8px',
    height: '44px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#232D36',
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7881' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: '40px',
    ...style,
  };

  return (
    <div style={{ width: '100%', marginBottom: label ? '8px' : 0 }} className={className}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: 500,
          color: '#232D36',
          marginBottom: '4px',
          fontFamily: 'var(--font-family-sans)',
        }}>
          {label}
        </label>
      )}
      <select ref={ref} style={selectStyles} {...props}>
        <option value="" disabled>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});

Select.displayName = 'Select';
