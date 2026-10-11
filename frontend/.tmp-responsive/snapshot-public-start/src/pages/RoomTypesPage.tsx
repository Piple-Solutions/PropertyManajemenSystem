import { MessageCircle } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/6200000000000?text=Halo%2C%20saya%20ingin%20informasi%20tipe%20kamar.';

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  backgroundColor: '#97764D',
  border: '1px solid #97764D',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '18px',
  fontWeight: 700,
  lineHeight: 1.4,
  padding: '12px 20px',
  minHeight: '44px',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background-color 150ms ease, opacity 150ms ease',
};

function handleCtaEnter(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.backgroundColor = '#7D6240';
  e.currentTarget.style.borderColor = '#7D6240';
}

function handleCtaLeave(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.backgroundColor = '#97764D';
  e.currentTarget.style.borderColor = '#97764D';
  e.currentTarget.style.opacity = '1';
}

export default function RoomTypesPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section
        aria-labelledby="roomtypes-title"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <h1
          id="roomtypes-title"
          style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}
        >
          Tipe Kamar
        </h1>
        <p style={{ fontSize: '14px', color: '#6B7881', margin: 0 }}>Daftar tipe kamar akan ditampilkan di sini.</p>
      </section>

      <section
        aria-label="Kontak lanjutan"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <p style={{ fontSize: '14px', color: '#6B7881', margin: 0 }}>Ingin menanyakan ketersediaan kamar? Hubungi kami.</p>
        <div style={{ alignSelf: 'flex-start' }}>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Hubungi kami via WhatsApp"
            style={ctaStyle}
            onMouseEnter={handleCtaEnter}
            onMouseLeave={handleCtaLeave}
            onMouseDown={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseUp={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <MessageCircle size={20} aria-hidden="true" color="#FFFFFF" />
            Hubungi via WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
