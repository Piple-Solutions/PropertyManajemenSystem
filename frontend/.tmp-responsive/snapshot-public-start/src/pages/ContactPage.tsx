import { MessageCircle, Phone, MapPin, Clock } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/6200000000000?text=Halo%2C%20saya%20ingin%20informasi%20pemesanan.';

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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '44px',
  padding: '12px 0',
  borderBottom: '1px solid #C7BBAB',
};

export default function ContactPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section
        aria-labelledby="contact-title"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <h1
          id="contact-title"
          style={{ fontSize: '24px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', margin: 0 }}
        >
          Hubungi Kami
        </h1>
        <p style={{ fontSize: '14px', color: '#6B7881', margin: 0 }}>Informasi kontak dan WhatsApp akan ditampilkan di sini.</p>
        <div style={{ position: 'sticky', top: '12px', alignSelf: 'flex-start', zIndex: 1 }}>
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

      <section
        aria-label="Detail kontak"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #C7BBAB', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}
      >
        <div style={rowStyle}>
          <Phone size={20} aria-hidden="true" color="#6B7881" />
          <span style={{ fontSize: '14px', color: '#232D36' }}>Telepon / WhatsApp</span>
        </div>
        <div style={rowStyle}>
          <MapPin size={20} aria-hidden="true" color="#6B7881" />
          <span style={{ fontSize: '14px', color: '#232D36' }}>Alamat properti</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <Clock size={20} aria-hidden="true" color="#6B7881" />
          <span style={{ fontSize: '14px', color: '#232D36' }}>Jam operasional</span>
        </div>
      </section>
    </div>
  );
}
