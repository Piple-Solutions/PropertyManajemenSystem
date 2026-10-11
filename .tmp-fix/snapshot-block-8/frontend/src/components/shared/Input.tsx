import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: boolean;
  errorMessage?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error = false,
    errorMessage,
    className = '',
    style,
    onFocus,
    onBlur,
    ...props
  }: InputProps,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const inputStyles: React.CSSProperties = {
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
    transition: 'border-color 150ms ease',
    boxSizing: 'border-box',
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
      <input
        ref={ref}
        style={inputStyles}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error ? '#962222' : '#97764D';
          (e.currentTarget as HTMLElement).style.outline = '2px solid #97764D';
          (e.currentTarget as HTMLElement).style.outlineOffset = '1px';
          onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error ? '#962222' : '#C7BBAB';
          (e.currentTarget as HTMLElement).style.outline = 'none';
          onBlur?.(e);
        }}
        {...props}
      />
      {error && errorMessage && (
        <span style={{
          fontSize: '12px',
          color: '#962222',
          marginTop: '4px',
          display: 'block',
          fontFamily: 'var(--font-family-sans)',
        }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
