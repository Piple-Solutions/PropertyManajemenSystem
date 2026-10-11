import React, { useState } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'disabled' | 'bronze';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
  hoverStyle?: React.CSSProperties;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  className = '',
  style,
  hoverStyle,
  ...props
}: ButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-family-sans)',
    fontWeight: 600,
    borderRadius: '8px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease, opacity 150ms ease',
    border: '1px solid transparent',
    opacity: disabled ? 0.6 : 1,
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { height: '36px', padding: '0 12px', fontSize: '12px' },
    md: { height: '44px', padding: '0 20px', fontSize: '14px' },
    lg: { height: '52px', padding: '0 24px', fontSize: '16px' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    secondary: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    outline: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    bronze: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    ghost: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    danger: {
      backgroundColor: '#232D36',
      color: '#FFFFFF',
      borderColor: '#232D36',
    },
    disabled: {
      backgroundColor: '#EEEDE9',
      color: '#6B7881',
      borderColor: '#C7BBAB',
    },
  };

  const resolvedVariant = disabled ? 'disabled' : variant;

  const currentBorderColor = isHovered && !disabled && !loading
    ? hoverStyle?.borderColor || '#97764D'
    : variantStyles[resolvedVariant].borderColor || 'transparent';

  const currentBackgroundColor = isHovered && !disabled && !loading
    ? hoverStyle?.backgroundColor || '#97764D'
    : variantStyles[resolvedVariant].backgroundColor;

  const currentColor = isHovered && !disabled && !loading
    ? hoverStyle?.color || '#FFFFFF'
    : variantStyles[resolvedVariant].color;

  const currentTransform = isHovered && !disabled && !loading
    ? 'scale(1.02)'
    : 'scale(1)';

  return (
    <button
      style={{ ...baseStyles, ...sizeStyles[size], ...variantStyles[resolvedVariant], borderColor: currentBorderColor, backgroundColor: currentBackgroundColor, color: currentColor, transform: currentTransform, ...style }}
      disabled={disabled || loading}
      className={className}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {loading ? (
        <span style={{ opacity: 0.8 }}>{children}</span>
      ) : (
        children
      )}
    </button>
  );
}
