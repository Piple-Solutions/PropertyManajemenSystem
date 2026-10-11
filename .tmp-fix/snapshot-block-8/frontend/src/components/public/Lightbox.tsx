import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { galleryPage, type GalleryTile } from '@/content/publicContent';
import { PlaceholderMedia } from './kit';

interface LightboxProps {
  tiles: GalleryTile[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
}

const RATIO: Record<GalleryTile['aspect'], number> = { wide: 1.6, tall: 0.75, square: 1 };
const SWIPE_PX = 50;

/** Inline chevrons: the lucide modules would each add a separate request on /gallery. */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/**
 * Photo preview dialog. Mounted only while open. It is portalled into the
 * public root (a sibling of header, main and footer) so those regions can be
 * made inert without disabling the dialog itself.
 */
export function Lightbox({ tiles, index, onClose, onChange }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const total = tiles.length;
  const tile = tiles[index];

  const go = useCallback(
    (delta: number) => onChange((index + delta + total) % total),
    [index, total, onChange],
  );

  // Modal behaviour: lock scroll, make the page inert, focus in, focus back.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const inertTargets = Array.from(
      document.querySelectorAll<HTMLElement>('#pub-main, #pub-footer, .pub-header, .pub-top'),
    );
    inertTargets.forEach((el) => {
      el.inert = true;
    });
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      inertTargets.forEach((el) => {
        el.inert = false;
      });
      opener?.focus?.();
    };
  }, []);

  // Keyboard: Escape closes, arrows navigate, Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        go(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        go(1);
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active) || (e.shiftKey && active === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!tile) return null;

  const { lightbox } = galleryPage;
  const position = lightbox.position.replace('{i}', String(index + 1)).replace('{n}', String(total));
  const frameStyle = { ['--pub-ar' as string]: RATIO[tile.aspect] } as CSSProperties;
  const container = document.querySelector('.pub-root') ?? document.body;

  return createPortal(
    <div
      ref={dialogRef}
      className="pub-lb"
      role="dialog"
      aria-modal="true"
      aria-label={lightbox.label}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;
        const dx = end - start;
        if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="pub-lb__top">
        <button ref={closeRef} type="button" className="pub-lb__btn" aria-label={lightbox.close} onClick={onClose}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <div
        className="pub-lb__stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div key={tile.id} className="pub-lb__frame" style={frameStyle}>
          <PlaceholderMedia variant="fill" label={galleryPage.placeholderLabel} src={tile.src} alt={tile.alt ?? tile.label} />
        </div>
      </div>
      <div className="pub-lb__bar">
        <button type="button" className="pub-lb__btn" aria-label={lightbox.prev} onClick={() => go(-1)}>
          <Chevron dir="left" />
        </button>
        <p className="pub-lb__caption" aria-live="polite">
          <strong>{tile.label}</strong>
          <span>
            {tile.category} · {position}
          </span>
        </p>
        <button type="button" className="pub-lb__btn" aria-label={lightbox.next} onClick={() => go(1)}>
          <Chevron dir="right" />
        </button>
      </div>
    </div>,
    container,
  );
}
