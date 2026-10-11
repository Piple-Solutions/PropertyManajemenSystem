import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={className} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      backgroundColor: '#FFFFFF',
      border: '1px solid #C7BBAB',
      borderRadius: '8px',
      textAlign: 'center',
      minHeight: '200px',
    }}>
      {icon && (
        <div style={{ marginBottom: '20px', color: '#6B7881' }} aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 style={{
        fontSize: '18px',
        fontWeight: 600,
        color: '#232D36',
        fontFamily: 'var(--font-family-sans)',
        marginBottom: '8px',
        marginTop: 0,
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#6B7881',
        marginBottom: action ? '20px' : 0,
      }}>
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
