import { Outlet } from 'react-router-dom';

interface LayoutProps {
  children?: React.ReactNode;
  className?: string;
}

export function BaseLayout({ className = '' }: LayoutProps) {
  return (
    <div className={className} style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#EEEDE9',
      fontFamily: 'var(--font-family-sans)',
      color: '#232D36',
    }}>
      <header style={{ flexShrink: 0 }}>
        {/* Header slot */}
      </header>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer style={{ flexShrink: 0 }}>
        {/* Footer slot */}
      </footer>
    </div>
  );
}
