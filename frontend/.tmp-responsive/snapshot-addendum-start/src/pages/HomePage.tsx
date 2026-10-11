import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Image as ImageIcon,
  MessageCircle,
  Star,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '@/services/api';
import type { RoomType } from '@/types/auth.types';
import { formatCurrency } from '@/utils/currencyUtils';
import logoWhite from '../../assets/LogoWhite.png';
import '../styles/home-sogo.css';

const WHATSAPP_NUMBER = '6200000000000';

function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const PHOTO_SLIDES = [
  { id: 'lobby', label: 'Lobby', caption: 'Ruang lobi yang nyaman' },
  { id: 'rooms', label: 'Kamar', caption: 'Kamar bersih dan tenang' },
  { id: 'suite', label: 'Suite', caption: 'Suite untuk keluarga' },
  { id: 'garden', label: 'Taman', caption: 'Area taman yang asri' },
  { id: 'reception', label: 'Resepsionis', caption: 'Layanan 24 jam' },
  { id: 'exterior', label: 'Eksterior', caption: 'Tampak depan properti' },
];

export default function HomePage() {
  // Public catalog: active room types via GET /api/public/room-types (no auth).
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/public/room-types`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data: RoomType[] } | null) => {
        if (!cancelled && json && Array.isArray(json.data)) setRoomTypes(json.data);
      })
      .catch(() => {
        if (!cancelled) setRoomTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rooms = useMemo(
    () => roomTypes.filter((r) => r.status === 'active').slice(0, 3),
    [roomTypes],
  );

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [formErrors, setFormErrors] = useState<{ checkIn?: string; checkOut?: string }>({});
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  function scrollToSlide(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(PHOTO_SLIDES.length - 1, index));
    const slide = track.querySelector<HTMLElement>('[data-slide]');
    const gap = 16;
    const width = slide ? slide.offsetWidth + gap : track.clientWidth;
    track.scrollTo({ left: clamped * width, behavior: 'auto' });
    setSlideIndex(clamped);
  }

  function handleTrackScroll() {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.querySelector<HTMLElement>('[data-slide]');
    const gap = 16;
    const width = slide ? slide.offsetWidth + gap : track.clientWidth;
    if (width > 0) setSlideIndex(Math.round(track.scrollLeft / width));
  }

  function handleAvailabilitySubmit(e: FormEvent) {
    e.preventDefault();
    const errors: { checkIn?: string; checkOut?: string } = {};
    if (!checkIn) errors.checkIn = 'Pilih tanggal check-in.';
    if (!checkOut) errors.checkOut = 'Pilih tanggal check-out.';
    if (checkIn && checkOut && checkOut <= checkIn) {
      errors.checkOut = 'Tanggal check-out harus setelah tanggal check-in.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setShowSummary(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setShowSummary(false);
    const message = `Halo, saya ingin cek ketersediaan kamar. Check-in: ${checkIn}, Check-out: ${checkOut}, Dewasa: ${adults}, Anak: ${children}.`;
    window.open(buildWhatsAppUrl(message), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="home-sogo">
      {/* 1 — Hero (SOGO site-hero) */}
      <section className="home-sogo__hero" aria-labelledby="home-title">
        <div className="home-sogo__container home-sogo__hero-inner">
          <img
            src={logoWhite}
            alt="Homestay Joglo Seruni Syariah"
            className="home-sogo__hero-logo"
            width={150}
            height={150}
          />
          <p className="home-sogo__eyebrow">Selamat Datang di Hotel Kami</p>
          <h1 id="home-title" className="home-sogo__title">
            Selamat Datang — A Best Place To Stay
          </h1>
          <p className="home-sogo__subtitle">Homestay Joglo Seruni Syariah</p>
          <div className="home-sogo__hero-ctas">
            <a
              className="home-sogo__cta home-sogo__cta--bronze"
              href={buildWhatsAppUrl('Halo, saya ingin informasi kamar.')}
              target="_blank"
              rel="noreferrer"
              aria-label="Hubungi kami via WhatsApp"
            >
              <MessageCircle size={20} aria-hidden="true" color="#FFFFFF" />
              Hubungi via WhatsApp
            </a>
            <Link className="home-sogo__cta home-sogo__cta--outline-light" to="/rooms">
              Lihat Kamar
            </Link>
          </div>
          <a className="home-sogo__scroll-cue" href="#availability" aria-label="Gulir ke cek ketersediaan">
            <ArrowDown size={20} aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* 2 — Availability (SOGO check-availabilty / block-32) */}
      <div className="home-sogo__container home-sogo__avail-wrap" id="availability">
        <div className="home-sogo__avail-card">
          <h2 className="home-sogo__avail-title">Cek Ketersediaan</h2>
          <p className="home-sogo__avail-sub">Pilih tanggal menginap, kami bantu via WhatsApp.</p>
          {showSummary && Object.keys(formErrors).length > 0 && (
            <div
              className="home-sogo__error-summary"
              role="alert"
              tabIndex={-1}
              ref={summaryRef}
              aria-labelledby="avail-error-title"
            >
              <h2 id="avail-error-title">Ada yang perlu diperbaiki</h2>
              <ul>
                {formErrors.checkIn && (
                  <li>
                    <a href="#av-checkin">Tanggal check-in: {formErrors.checkIn}</a>
                  </li>
                )}
                {formErrors.checkOut && (
                  <li>
                    <a href="#av-checkout">Tanggal check-out: {formErrors.checkOut}</a>
                  </li>
                )}
              </ul>
            </div>
          )}
          <form onSubmit={handleAvailabilitySubmit} noValidate>
            <div className="home-sogo__avail-grid">
              <div className={`home-sogo__field${formErrors.checkIn ? ' home-sogo__field--error' : ''}`}>
                <label htmlFor="av-checkin">Check In</label>
                <input
                  id="av-checkin"
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  aria-invalid={Boolean(formErrors.checkIn)}
                  aria-describedby={formErrors.checkIn ? 'av-checkin-error' : undefined}
                />
                {formErrors.checkIn && (
                  <span className="home-sogo__field-error" id="av-checkin-error" role="alert">
                    {formErrors.checkIn}
                  </span>
                )}
              </div>
              <div className={`home-sogo__field${formErrors.checkOut ? ' home-sogo__field--error' : ''}`}>
                <label htmlFor="av-checkout">Check Out</label>
                <input
                  id="av-checkout"
                  type="date"
                  value={checkOut}
                  min={checkIn || undefined}
                  onChange={(e) => setCheckOut(e.target.value)}
                  aria-invalid={Boolean(formErrors.checkOut)}
                  aria-describedby={formErrors.checkOut ? 'av-checkout-error' : undefined}
                />
                {formErrors.checkOut && (
                  <span className="home-sogo__field-error" id="av-checkout-error" role="alert">
                    {formErrors.checkOut}
                  </span>
                )}
              </div>
              <div className="home-sogo__guest-row">
                <div className="home-sogo__field">
                  <label htmlFor="av-adults">Dewasa</label>
                  <select id="av-adults" value={adults} onChange={(e) => setAdults(e.target.value)}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4+">4+</option>
                  </select>
                </div>
                <div className="home-sogo__field">
                  <label htmlFor="av-children">Anak</label>
                  <select id="av-children" value={children} onChange={(e) => setChildren(e.target.value)}>
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4+">4+</option>
                  </select>
                </div>
              </div>
              <div className="home-sogo__avail-action">
                <Button variant="bronze" type="submit">
                  <CalendarDays size={20} aria-hidden="true" color="#FFFFFF" />
                  Cek Ketersediaan
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 3 — Welcome (SOGO welcome + overlapping visual) */}
      <section className="home-sogo__section" aria-labelledby="welcome-title">
        <div className="home-sogo__container home-sogo__welcome-grid">
          <div className="home-sogo__welcome-copy">
            <p className="home-sogo__eyebrow">Tentang Kami</p>
            <h2 id="welcome-title">Welcome!</h2>
            <p>
              Nikmati pengalaman menginap yang nyaman dengan pelayanan hangat, kamar bersih, dan lokasi
              strategis. Hubungi kami langsung untuk informasi kamar dan pemesanan.
            </p>
            <div className="home-sogo__welcome-links">
              <Link className="home-sogo__cta home-sogo__cta--bronze" to="/about">
                Learn More
              </Link>
              <span className="home-sogo__welcome-sep" aria-hidden="true">
                or
              </span>
              <a
                className="home-sogo__text-link"
                href={buildWhatsAppUrl('Halo, saya ingin informasi properti.')}
                target="_blank"
                rel="noreferrer"
              >
                Chat WhatsApp
              </a>
            </div>
          </div>
          <div className="home-sogo__welcome-visual">
            <div className="home-sogo__welcome-panel" role="img" aria-label="Ilustrasi sambutan hotel">
              <div className="home-sogo__welcome-panel-icon">
                <BedDouble size={32} aria-hidden="true" />
              </div>
              <strong>Kenyamanan Utama</strong>
              <p>Kamar tenang, fasilitas lengkap, staf siap membantu.</p>
            </div>
            <div className="home-sogo__welcome-badge">
              <Star size={20} aria-hidden="true" color="#97764D" />
              <div>
                <strong>4.9</strong>
                <br />
                <span>
                  Rating tamu
                  <br />
                  yang menginap
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — Rooms & Suites (SOGO rooms) */}
      <section className="home-sogo__section home-sogo__section--muted" aria-labelledby="rooms-title">
        <div className="home-sogo__container">
          <div className="home-sogo__section-head">
            <p className="home-sogo__eyebrow">Pilihan Kami</p>
            <h2 id="rooms-title">Rooms &amp; Suites</h2>
            <p>Tiga tipe favorit tamu. Lihat semua tipe untuk detail fasilitas dan harga.</p>
          </div>
          <div className="home-sogo__rooms-grid">
            {rooms.map((room) => (
              <article className="home-sogo__room-card" key={room.id} aria-labelledby={`room-${room.id}`}>
                <div className="home-sogo__room-visual">
                  <BedDouble size={40} aria-hidden="true" />
                  <span className="home-sogo__room-capacity">
                    <Users size={14} aria-hidden="true" />
                    {room.capacity} orang
                  </span>
                </div>
                <div className="home-sogo__room-body">
                  <h3 id={`room-${room.id}`}>
                    <Link to="/rooms">{room.name}</Link>
                  </h3>
                  <p className="home-sogo__room-desc">{room.description}</p>
                  <div className="home-sogo__chip-row" aria-label={`Fasilitas ${room.name}`}>
                    {room.facilities.slice(0, 3).map((facility) => (
                      <span className="home-sogo__chip" key={facility}>
                        {facility}
                      </span>
                    ))}
                    {room.facilities.length > 3 && (
                      <span className="home-sogo__chip">+{room.facilities.length - 3} lainnya</span>
                    )}
                  </div>
                  <div className="home-sogo__room-foot">
                    <p className="home-sogo__room-price">
                      {formatCurrency(room.defaultRate)}
                      <small>per malam, mulai dari</small>
                    </p>
                    <Link className="home-sogo__text-link" to="/rooms" aria-label={`Lihat detail ${room.name}`}>
                      Detail
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="home-sogo__rooms-more">
            <Link className="home-sogo__cta home-sogo__cta--bronze" to="/rooms">
              Lihat Semua Kamar
            </Link>
          </div>
        </div>
      </section>

      {/* 5 — Photos (SOGO slider; no autoplay by design) */}
      <section className="home-sogo__section" aria-labelledby="photos-title">
        <div className="home-sogo__container">
          <div className="home-sogo__section-head">
            <p className="home-sogo__eyebrow">Galeri</p>
            <h2 id="photos-title">Photos</h2>
            <p>Geser atau gunakan tombol untuk melihat sudut properti kami.</p>
          </div>
          <div className="home-sogo__carousel">
            <div
              className="home-sogo__carousel-viewport"
              ref={trackRef}
              onScroll={handleTrackScroll}
              tabIndex={0}
              role="region"
              aria-roledescription="carousel"
              aria-label="Galeri foto properti. Gunakan tombol panah untuk berpindah."
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') scrollToSlide(slideIndex + 1);
                if (e.key === 'ArrowLeft') scrollToSlide(slideIndex - 1);
              }}
            >
              <ul className="home-sogo__carousel-track">
                {PHOTO_SLIDES.map((slide, i) => (
                  <li
                    className="home-sogo__slide"
                    key={slide.id}
                    data-slide
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${i + 1} dari ${PHOTO_SLIDES.length}: ${slide.label}`}
                  >
                    <div className="home-sogo__slide-visual">
                      <ImageIcon size={32} aria-hidden="true" />
                      <span>{slide.label}</span>
                      <small>{slide.caption}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="home-sogo__carousel-bar">
              <div className="home-sogo__carousel-nav">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToSlide(slideIndex - 1)}
                  disabled={slideIndex === 0}
                  aria-label="Foto sebelumnya"
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToSlide(slideIndex + 1)}
                  disabled={slideIndex === PHOTO_SLIDES.length - 1}
                  aria-label="Foto berikutnya"
                >
                  <ArrowRight size={20} aria-hidden="true" />
                </Button>
              </div>
              <span className="home-sogo__carousel-pos" aria-live="polite">
                {slideIndex + 1} / {PHOTO_SLIDES.length}
              </span>
            </div>
            <div className="home-sogo__carousel-link">
              <Link className="home-sogo__text-link" to="/gallery">
                Lihat Galeri Lengkap
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — Reserve CTA banner (SOGO bottom overlay) */}
      <section className="home-sogo__reserve" aria-labelledby="reserve-title">
        <div className="home-sogo__container home-sogo__reserve-inner">
          <div>
            <h2 id="reserve-title">A Best Place To Stay. Reserve Now!</h2>
            <p>Butuh informasi kamar? Hubungi kami — respons cepat via WhatsApp.</p>
          </div>
          <div className="home-sogo__reserve-ctas">
            <a
              className="home-sogo__cta home-sogo__cta--bronze"
              href={buildWhatsAppUrl('Halo, saya ingin reservasi kamar.')}
              target="_blank"
              rel="noreferrer"
              aria-label="Reservasi sekarang via WhatsApp"
            >
              <MessageCircle size={20} aria-hidden="true" color="#FFFFFF" />
              Reserve Now
            </a>
            <Link className="home-sogo__cta home-sogo__cta--outline-light" to="/contact">
              Hubungi Kami
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
