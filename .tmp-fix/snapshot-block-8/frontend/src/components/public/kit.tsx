/**
 * Shared public UI kit: small presentational pieces and hooks used by the five
 * public pages. It is ONE module on purpose: Rollup cannot split a single
 * module, so the whole kit ships as one chunk (one request) instead of ~10 tiny
 * ones, which matters on slow mobile connections. Page-only modules (Lightbox,
 * AvailabilityForm) and the header/footer chunk (PublicChrome) live elsewhere.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  BedDouble,
  Car,
  ChevronDown,
  HeartHandshake,
  Leaf,
  MessageCircle,
  Sofa,
  Sparkles,
  Sunrise,
  Trees,
  Utensils,
  Wifi,
} from 'lucide-react';
import { API_BASE_URL } from '@/services/api';
import type { RoomType } from '@/types/auth.types';
import {
  buildWhatsAppUrl,
  home,
  type FaqItem,
  type IconKey,
  type PageCtaContent,
  type PageHeroContent,
} from '@/content/publicContent';
import { usePublic, type HeaderTone } from './PublicContext';

/* ---------- Icons ---------- */

export const ICONS: Record<IconKey, ComponentType<{ size?: number | string }>> = {
  sofa: Sofa,
  leaf: Leaf,
  sparkles: Sparkles,
  heart: HeartHandshake,
  wifi: Wifi,
  car: Car,
  utensils: Utensils,
  trees: Trees,
  bed: BedDouble,
  sunrise: Sunrise,
};

/* ---------- Page hooks ---------- */

/**
 * Pages whose first block is dark (hero) declare it so the header can start
 * transparent. Runs in a layout effect so the first paint is already correct.
 */
export function usePublicTone(tone: HeaderTone): void {
  const { setTone } = usePublic();
  useLayoutEffect(() => {
    setTone(tone);
    return () => setTone('light');
  }, [tone, setTone]);
}

const DEFAULT_TITLE = 'Homestay Joglo Seruni Syariah';

/** Per-page document title; restores the default on unmount. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${DEFAULT_TITLE}`;
    return () => {
      document.title = previous || DEFAULT_TITLE;
    };
  }, [title]);
}

/* ---------- Media placeholder ---------- */

export type MediaVariant = 'arch' | 'wide' | 'card' | 'portrait' | 'tile' | 'fill';

interface PlaceholderMediaProps {
  variant?: MediaVariant;
  /** Visible caption on the placeholder (e.g. "Foto akan ditambahkan"). */
  label?: string;
  /** Real photo: when provided it replaces the placeholder inside the same box. */
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Only the hero image should be high priority; everything else is lazy. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Designed placeholder (CSS gradients + one shared pattern). The aspect ratio
 * is reserved by CSS (`.pub-media--*`), so swapping in a real photo later does
 * not shift the layout.
 */
export function PlaceholderMedia({
  variant = 'card',
  label,
  src,
  alt = '',
  width,
  height,
  priority = false,
  className = '',
  style,
}: PlaceholderMediaProps) {
  const classes = `pub-media pub-media--${variant}${className ? ` ${className}` : ''}`;
  if (src) {
    return (
      <div className={classes} style={style}>
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
        />
      </div>
    );
  }
  return (
    <div className={classes} style={style} aria-hidden="true">
      <span className="pub-media__pattern" />
      {label ? <span className="pub-media__label">{label}</span> : null}
    </div>
  );
}

/* ---------- Ornament ---------- */

/**
 * Joglo roofline ornament. The path is defined ONCE as <symbol id="pub-roof">
 * by the header; every instance only references it.
 */
export function OrnamentDivider({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <div className={`pub-divider pub-divider--${tone}`} aria-hidden="true">
      <span className="pub-divider__line" />
      <svg className="pub-divider__roof" viewBox="0 0 240 28" width="120" height="14" focusable="false">
        <use href="#pub-roof" />
      </svg>
      <span className="pub-divider__line" />
    </div>
  );
}

/* ---------- Scroll reveal ---------- */

/**
 * ONE IntersectionObserver is shared by every reveal element on the site.
 * Elements are unobserved as soon as they are revealed. When IntersectionObserver
 * is unavailable the content simply stays visible: it is only hidden by CSS
 * under the `.pub-js` class, which is applied only when reveal can work.
 */
type Callback = () => void;

let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, Callback>();

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = callbacks.get(entry.target);
          sharedObserver?.unobserve(entry.target);
          callbacks.delete(entry.target);
          cb?.();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
  }
  return sharedObserver;
}

function observeOnce(el: Element, cb: Callback): () => void {
  const observer = getObserver();
  if (!observer) {
    cb();
    return () => undefined;
  }
  callbacks.set(el, cb);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer.unobserve(el);
  };
}

interface RevealProps {
  as?: ElementType;
  /** Known to be above the fold at every viewport: shown at mount, no observer, no layout read. */
  immediate?: boolean;
  /** Stagger index (0-6). Capped so a whole group stays under ~500ms. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Reveal({ as: Tag = 'div', immediate = false, delay = 0, className = '', style, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const { enhanced } = usePublic();
  // 'now': already on screen at mount (no transition); 'in': scrolled into view (fades in).
  const [state, setState] = useState<'hidden' | 'now' | 'in'>('hidden');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!enhanced || immediate) {
      setState('now');
      return undefined;
    }
    // No geometry read here: it would force the whole page's first layout inside this
    // commit task. The shared observer reports elements that are already in view too.
    return observeOnce(el, () => setState('in'));
  }, [enhanced, immediate]);

  const step = Math.max(0, Math.min(6, delay));
  return (
    <Tag
      ref={ref}
      className={`pub-reveal${state === 'hidden' ? '' : ' is-in'}${state === 'now' ? ' is-now' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...style, '--pub-i': step } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/* ---------- FAQ accordion ---------- */

export function Accordion({ items }: { items: FaqItem[] }) {
  const base = useId();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="pub-acc">
      {items.map((item, index) => {
        const isOpen = open === index;
        const buttonId = `${base}-b-${index}`;
        const panelId = `${base}-p-${index}`;
        return (
          <div className={`pub-acc__item${isOpen ? ' is-open' : ''}`} key={item.q}>
            <h3 className="pub-acc__head">
              <button
                type="button"
                id={buttonId}
                className="pub-acc__btn"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                <span>{item.q}</span>
                <ChevronDown size={20} aria-hidden="true" className="pub-acc__chev" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className="pub-acc__panel">
              <div className="pub-acc__inner">
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Inner page hero and closing CTA ---------- */

const step = (n: number): CSSProperties => ({ ['--pub-i' as string]: n }) as CSSProperties;

interface PageHeroProps {
  /** Unique id for the heading (used by aria-labelledby). */
  id: string;
  content: PageHeroContent;
  /** Optional action row (buttons) placed under the lead. */
  children?: ReactNode;
}

/**
 * Compact dark hero used at the top of every inner page. Like the Home hero,
 * the h1 and lead are deliberately NOT animated (an animation would keep
 * Chrome from treating them as the largest contentful paint).
 */
export function PageHero({ id, content, children }: PageHeroProps) {
  return (
    <section className="pub-hero pub-hero--page" aria-labelledby={id}>
      <div className="pub-hero__pattern" aria-hidden="true" />
      <div className="pub-hero__roofline" aria-hidden="true" />
      <div className="pub-container pub-hero__grid">
        <div className="pub-hero__copy">
          <p className="pub-eyebrow pub-enter" style={step(0)}>
            {content.eyebrow}
          </p>
          <h1 id={id} className="pub-display">
            {content.title}
          </h1>
          <p className="pub-lead">{content.subtitle}</p>
          {children ? (
            <div className="pub-actions pub-enter" style={step(2)}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Closing call-to-action card shared by the inner pages (light, not another dark band). */
export function PageCta({ id, content }: { id: string; content: PageCtaContent }) {
  return (
    <section className="pub-section pub-section--warm pub-section--tight" aria-labelledby={id}>
      <div className="pub-container">
        <Reveal className="pub-ctacard">
          <div className="pub-ctacard__copy">
            <h2 id={id} className="pub-h2">
              {content.title}
            </h2>
            <p className="pub-body">{content.subtitle}</p>
          </div>
          <div className="pub-ctacard__actions">
            <a
              className="pub-btn pub-btn--primary"
              href={buildWhatsAppUrl(content.primaryMessage)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={20} aria-hidden="true" />
              {content.primary}
            </a>
            <Link className="pub-btn pub-btn--outline" to={content.secondaryTo}>
              {content.secondary}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Room catalog ---------- */

/** Reserves the room card's box while the catalog loads (no layout shift when data arrives). */
export function RoomSkeleton() {
  return (
    <li className="pub-room pub-room--skeleton" aria-hidden="true">
      <PlaceholderMedia variant="card" />
      <div className="pub-room__body">
        <span className="pub-skel pub-skel--title" />
        <span className="pub-skel" />
        <span className="pub-skel pub-skel--short" />
      </div>
    </li>
  );
}

/**
 * Same output as utils/currencyUtils.formatCurrency (IDR, no decimals), but the formatter
 * is built once: constructing an Intl.NumberFormat per room is slow on phones.
 */
let idrFormat: Intl.NumberFormat | null = null;
function formatIdr(amount: number): string {
  idrFormat ??= new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });
  return idrFormat.format(amount);
}

export interface RoomItem {
  id: string;
  name: string;
  description: string;
  capacity: number;
  facilities: string[];
  price: string;
}

interface RoomTypesState {
  rooms: RoomItem[];
  /** The request has settled (success or failure). */
  loaded: boolean;
  /** The list is the built-in sample, not data from the API. */
  sample: boolean;
}

/**
 * Public room catalog: active room types via GET /api/public/room-types (no
 * auth). Falls back to the sample rooms in publicContent when the request
 * fails or returns nothing, so the page is never empty.
 */
export function useRoomTypes(): RoomTypesState {
  const [apiRooms, setApiRooms] = useState<RoomType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/public/room-types`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data: RoomType[] } | null) => {
        if (!cancelled && json && Array.isArray(json.data)) setApiRooms(json.data);
      })
      .catch(() => {
        if (!cancelled) setApiRooms([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const active = apiRooms.filter((r) => r.status === 'active');
    if (active.length > 0) {
      return {
        loaded,
        sample: false,
        rooms: active.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          capacity: r.capacity,
          facilities: r.facilities,
          price: formatIdr(r.defaultRate),
        })),
      };
    }
    return {
      loaded,
      sample: true,
      rooms: home.rooms.fallback.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        capacity: r.capacity,
        facilities: r.facilities,
        price: r.priceLabel,
      })),
    };
  }, [apiRooms, loaded]);
}
