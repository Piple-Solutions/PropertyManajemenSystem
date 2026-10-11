import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: boolean;
  errorMessage?: string;
}

export function Textarea({
  label,
  hint,
  error = false,
  errorMessage,
  className = '',
  style,
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const textareaStyles: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-family-sans)',
    backgroundColor: '#FFFFFF',
    border: `1px solid ${error ? '#962222' : '#C7BBAB'}`,
    borderRadius: '8px',
    minHeight: '96px',
    padding: '12px 14px',
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#232D36',
    outline: 'none',
    transition: 'border-color 150ms ease',
    boxSizing: 'border-box',
    resize: 'vertical',
    ...style,
  };

  return (
    <div style={{ width: '100%', marginBottom: label ? '8px' : 0 }} className={className}>
      {label && (
        <label
          htmlFor={textareaId}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#232D36',
            marginBottom: '4px',
            fontFamily: 'var(--font-family-sans)',
          }}
        >
          {label}
          {hint && (
            <span style={{ fontSize: '12px', fontWeight: 400, color: '#6B7881' }}>{hint}</span>
          )}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        style={textareaStyles}
        aria-invalid={error || undefined}
        aria-describedby={error && errorMessage ? `${textareaId}-error` : undefined}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error ? '#962222' : '#97764D';
          (e.currentTarget as HTMLElement).style.outline = '2px solid #97764D';
          (e.currentTarget as HTMLElement).style.outlineOffset = '1px';
          props.onFocus?.(e as React.FocusEvent<HTMLTextAreaElement>);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error ? '#962222' : '#C7BBAB';
          (e.currentTarget as HTMLElement).style.outline = 'none';
          props.onBlur?.(e as React.FocusEvent<HTMLTextAreaElement>);
        }}
        {...props}
      />
      {error && errorMessage && (
        <span
          id={`${textareaId}-error`}
          role="alert"
          style={{
            fontSize: '12px',
            color: '#962222',
            marginTop: '4px',
            display: 'block',
            fontFamily: 'var(--font-family-sans)',
          }}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
