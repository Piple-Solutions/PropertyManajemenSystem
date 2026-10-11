import { Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#EEEDE9',
      fontFamily: 'var(--font-family-sans)',
    }}>
      <header style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #C7BBAB',
        padding: '12px 20px',
      }}>
        {/* Public Header */}
      </header>
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>
      <footer style={{
        backgroundColor: '#232D36',
        color: '#FFFFFF',
        padding: '20px',
        textAlign: 'center',
        fontSize: '14px',
      }}>
        {/* Public Footer */}
      </footer>
    </div>
  );
}
