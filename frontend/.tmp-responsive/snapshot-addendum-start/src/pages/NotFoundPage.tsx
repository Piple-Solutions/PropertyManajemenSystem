import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#EEEDE9',
      textAlign: 'center',
      padding: '20px',
    }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', marginBottom: '12px', marginTop: 0 }}>
          404
        </h1>
        <p style={{ color: '#6B7881', marginBottom: '16px' }}>Halaman tidak ditemukan</p>
        <Link to="/" style={{ color: '#97764D', fontSize: '14px', fontWeight: 600 }}>Kembali ke Beranda</Link>
      </div>
    </div>
  );
}
