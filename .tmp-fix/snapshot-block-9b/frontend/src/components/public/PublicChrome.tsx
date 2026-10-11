import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, Clock, MapPin, Menu, MessageCircle, Phone, X } from 'lucide-react';
import { buildWhatsAppUrl, chrome, nav, site } from '@/content/publicContent';
import { logo } from './brand';
import { OrnamentDivider } from './kit';
import { usePublic } from './PublicContext';
import '../../styles/public.css';

/**
 * Tracks one sentinel with a dedicated IntersectionObserver (no scroll
 * listeners). Returns true while the sentinel is OUT of view.
 */
function useScrolledPast(ref: RefObject<HTMLElement>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/** Active state without NavLink (keeps NavLink out of the shared entry chunk). */
function isActive(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

export function PublicHeader() {
  const { tone } = usePublic();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const scrolled = useScrolledPast(topRef);

  // Route change closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Open menu: lock scroll, make the page inert, trap Tab, Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const inertTargets = ['pub-main', 'pub-footer']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    inertTargets.forEach((el) => {
      el.inert = true;
    });
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onMq);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = [
        toggleRef.current,
        ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []),
      ].filter((el): el is HTMLElement => el !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
      document.body.style.overflow = previousOverflow;
      inertTargets.forEach((el) => {
        el.inert = false;
      });
    };
  }, [open]);

  // Focus: into the panel on open, back to the toggle on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  const solid = scrolled || open || tone === 'light';
  const whatsapp = buildWhatsAppUrl(chrome.headerCtaMessage);

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        {/* Roofline ornament: defined ONCE here and referenced everywhere with <use>. */}
        <symbol id="pub-roof" viewBox="0 0 240 28">
          <path
            d="M4 25H86L98 18H110L118 10H122L130 18H142L154 25H236M104 25V21M136 25V21M120 10V4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </symbol>
      </svg>
      <div className="pub-sentinel" ref={topRef} aria-hidden="true" />
      <header className="pub-header" data-solid={solid ? 'true' : 'false'} data-open={open ? 'true' : 'false'}>
        <a className="pub-skip" href="#pub-main">
          {chrome.skipLink}
        </a>
        <div className="pub-container pub-header__bar">
          <Link className="pub-brand" to="/" aria-label={`${site.shortName}, beranda`}>
            {/* Both variants are in the DOM; CSS shows the one that fits the header state. */}
            <img
              className="pub-brand__logo pub-brand__logo--white"
              src={logo.white.src}
              width={logo.white.width}
              height={logo.white.height}
              alt=""
              decoding="async"
            />
            <img
              className="pub-brand__logo pub-brand__logo--brown"
              src={logo.brown.src}
              width={logo.brown.width}
              height={logo.brown.height}
              alt=""
              decoding="async"
              fetchPriority="low"
            />
          </Link>
          <nav className="pub-nav" aria-label="Navigasi utama">
            <ul>
              {nav.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="pub-nav__link" aria-current={isActive(location.pathname, item.to) ? 'page' : undefined}>
                      {item.label}
                    </Link>
                </li>
              ))}
            </ul>
          </nav>
          <a className="pub-btn pub-btn--primary pub-btn--sm pub-header__cta" href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" />
            {chrome.headerCta}
          </a>
          <button
            ref={toggleRef}
            type="button"
            className="pub-menu-btn"
            aria-expanded={open}
            aria-controls="pub-menu"
            aria-label={open ? chrome.menuClose : chrome.menuOpen}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          </button>
        </div>
        <div
          id="pub-menu"
          ref={panelRef}
          className="pub-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          data-open={open ? 'true' : 'false'}
        >
          <nav aria-label="Menu seluler">
            <ul className="pub-menu__list">
              {nav.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="pub-menu__link" aria-current={isActive(location.pathname, item.to) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <a className="pub-btn pub-btn--primary pub-menu__cta" href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle size={20} aria-hidden="true" />
            {chrome.headerCta}
          </a>
        </div>
      </header>
    </>
  );
}

export function PublicFooter() {
  const farRef = useRef<HTMLDivElement>(null);
  const farAway = useScrolledPast(farRef);
  const year = new Date().getFullYear();

  return (
    <>
      <div className="pub-sentinel pub-sentinel--far" ref={farRef} aria-hidden="true" />
      <footer id="pub-footer" className="pub-footer">
        <div className="pub-container">
          <OrnamentDivider tone="dark" />
          <div className="pub-footer__grid">
            <div className="pub-footer__brand">
              <img
                className="pub-footer__logo"
                src={logo.white.src}
                width={logo.white.width}
                height={logo.white.height}
                alt={site.name}
                loading="lazy"
                decoding="async"
              />
              <p>{site.tagline}</p>
            </div>
            <nav className="pub-footer__col" aria-label="Tautan situs">
              <h2 className="pub-footer__title">{chrome.footerNavTitle}</h2>
              <ul>
                {nav.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="pub-footer__col pub-footer__col--contact">
              <h2 className="pub-footer__title">{chrome.footerContactTitle}</h2>
              <ul className="pub-footer__contact">
                <li>
                  <Phone size={18} aria-hidden="true" />
                  <span>{site.phone}</span>
                </li>
                <li>
                  <MapPin size={18} aria-hidden="true" />
                  <span>{site.address}</span>
                </li>
                <li>
                  <Clock size={18} aria-hidden="true" />
                  <span>{site.hours}</span>
                </li>
              </ul>
            </div>
          </div>
          <p className="pub-footer__legal">
            © {year} {site.name}. {chrome.footerNote}
          </p>
        </div>
      </footer>
      <button
        type="button"
        className="pub-top"
        data-visible={farAway ? 'true' : 'false'}
        aria-label={chrome.backToTop}
        tabIndex={farAway ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp size={20} aria-hidden="true" />
      </button>
    </>
  );
}
