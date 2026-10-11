import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  raised?: boolean;
  style?: React.CSSProperties;
}

export function Card({ title, children, footer, className = '', hover = false, padding = 'md', raised: _raised = false, style }: CardProps) {
  const paddingMap: Record<string, string> = {
    sm: '12px',
    md: '16px',
    lg: '20px',
  };

  return (
    <div
      className={className}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: paddingMap[padding],
        border: '1px solid #C7BBAB',
        boxShadow: 'none',
        transition: hover ? 'border-color 150ms ease' : 'none',
        ...style,
      }}
      onMouseEnter={hover ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = '#97764D'; } : undefined}
      onMouseLeave={hover ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C7BBAB'; } : undefined}
    >
      {title && (
        <h3 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#232D36',
          fontFamily: 'var(--font-family-sans)',
          marginBottom: '12px',
          marginTop: 0,
        }}>
          {title}
        </h3>
      )}
      <div style={{ flex: 1 }}>{children}</div>
      {footer && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #C7BBAB',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}
