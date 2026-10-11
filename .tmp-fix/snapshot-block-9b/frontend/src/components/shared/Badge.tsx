import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const colorMap: Record<string, { background: string; color: string; border: string }> = {
  default: { background: '#EEEDE9', color: '#232D36', border: '#C7BBAB' },
  success: { background: '#E3EDE4', color: '#2F5D37', border: '#2F5D37' },
  warning: { background: '#F0E7D3', color: '#7A5A1E', border: '#7A5A1E' },
  danger: { background: '#F3DEDE', color: '#962222', border: '#962222' },
  info: { background: '#DDE5EC', color: '#2F4A5E', border: '#2F4A5E' },
  blue: { background: '#DDE5EC', color: '#2F4A5E', border: '#2F4A5E' },
};

const sizeMap: Record<string, React.CSSProperties> = {
  sm: { padding: '2px 8px', fontSize: '11px' },
  md: { padding: '4px 12px', fontSize: '12px' },
  lg: { padding: '6px 16px', fontSize: '14px' },
};

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  const colors = colorMap[variant];
  const sizes = sizeMap[size];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '4px',
        fontWeight: 600,
        fontFamily: 'var(--font-family-sans)',
        background: colors.background,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        ...sizes,
      }}
    >
      {children}
    </span>
  );
}
