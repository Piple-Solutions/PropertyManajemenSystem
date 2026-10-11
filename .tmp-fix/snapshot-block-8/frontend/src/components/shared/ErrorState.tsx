import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Terjadi Kesalahan', description = 'Maaf, terjadi kesalahan. Silakan coba lagi.', error, onRetry, className = '' }: ErrorStateProps) {
  return (
    <div className={className} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      backgroundColor: '#FFFFFF',
      border: '1px solid #962222',
      borderRadius: '8px',
      textAlign: 'center',
      minHeight: '200px',
    }}>
      <div style={{ marginBottom: '16px', color: '#962222' }} aria-hidden="true">
        <AlertTriangle size={40} />
      </div>
      <h3 style={{
        fontSize: '18px',
        fontWeight: 600,
        color: '#962222',
        fontFamily: 'var(--font-family-sans)',
        margin: '0 0 8px 0',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#6B7881',
        margin: `0 0 ${error ? '8px' : '20px'} 0`,
      }}>
        {description}
      </p>
      {error && (
        <p style={{
          fontSize: '12px',
          color: '#6B7881',
          marginBottom: '20px',
          fontFamily: 'monospace',
        }}>
          {error}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            backgroundColor: '#232D36',
            color: '#FFFFFF',
            border: '1px solid #232D36',
            borderRadius: '8px',
            height: '44px',
            padding: '0 20px',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: 'var(--font-family-sans)',
            cursor: 'pointer',
          }}
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}
