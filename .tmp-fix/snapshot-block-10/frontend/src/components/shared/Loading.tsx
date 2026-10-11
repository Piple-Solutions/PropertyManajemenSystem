interface LoadingProps {
  variant?: 'spinner' | 'skeleton' | 'page';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Loading({ variant = 'spinner', size = 'md', className = '' }: LoadingProps) {
  const sizeMap: Record<string, string> = {
    sm: '20px',
    md: '40px',
    lg: '60px',
  };

  if (variant === 'page') {
    return (
      <div className={className} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#EEEDE9',
      }}>
        <div style={{
          width: sizeMap[size],
          height: sizeMap[size],
          border: '3px solid #C7BBAB',
          borderTopColor: '#97764D',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (variant === 'skeleton') {
    return (
      <div className={className} style={{
        backgroundColor: '#EEEDE9',
        border: '1px solid #C7BBAB',
        borderRadius: '8px',
        height: '20px',
        width: '80%',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    );
  }

  return (
    <div className={className} style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: sizeMap[size],
        height: sizeMap[size],
        border: '3px solid #C7BBAB',
        borderTopColor: '#97764D',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
