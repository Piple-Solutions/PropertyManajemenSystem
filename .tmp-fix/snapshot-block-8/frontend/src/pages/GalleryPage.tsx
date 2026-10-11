import { useCallback, useMemo, useState } from 'react';
import { galleryPage } from '@/content/publicContent';
import { Lightbox } from '@/components/public/Lightbox';
import { PageCta, PageHero, PlaceholderMedia, usePageTitle, usePublicTone } from '@/components/public/kit';
import '../styles/public.css';

const ALL = '';

export default function GalleryPage() {
  usePublicTone('dark');
  usePageTitle(galleryPage.title);

  const [category, setCategory] = useState<string>(ALL);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const total = galleryPage.tiles.length;
  const visible = useMemo(
    () => (category === ALL ? galleryPage.tiles : galleryPage.tiles.filter((t) => t.category === category)),
    [category],
  );
  const close = useCallback(() => setOpenIndex(null), []);
  const countText = galleryPage.count.replace('{shown}', String(visible.length)).replace('{total}', String(total));
  const filters = [{ value: ALL, label: galleryPage.all }, ...galleryPage.categories.map((c) => ({ value: c, label: c }))];

  return (
    <>
      <PageHero id="gallery-title" content={galleryPage.hero} />

      <section className="pub-section" aria-label={galleryPage.title}>
        <div className="pub-container">
          <div className="pub-gfilter" role="group" aria-label={galleryPage.filterLabel}>
            {filters.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                className="pub-chipbtn"
                aria-pressed={category === f.value}
                onClick={() => setCategory(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="pub-gcount" aria-live="polite">
            {countText}
          </p>

          {/* Keyed by filter: a short fade replays when the set changes. Spans only in the full view. */}
          <ul
            key={category || 'all'}
            className={`pub-gt-grid pub-enter${category === ALL ? '' : ' pub-gt-grid--uniform'}`}
          >
            {visible.map((tile, index) => (
              <li key={tile.id} className={`pub-gt pub-gt--${tile.aspect}`}>
                <button
                  type="button"
                  className="pub-gt__btn"
                  aria-label={`${galleryPage.openPhoto}: ${tile.label}`}
                  aria-haspopup="dialog"
                  onClick={() => setOpenIndex(index)}
                >
                  <PlaceholderMedia variant="fill" src={tile.src} alt={tile.alt ?? ''} />
                  <span className="pub-gt__cap">{tile.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PageCta id="gallery-cta-title" content={galleryPage.cta} />

      {openIndex !== null && (
        <Lightbox tiles={visible} index={openIndex} onClose={close} onChange={setOpenIndex} />
      )}
    </>
  );
}
