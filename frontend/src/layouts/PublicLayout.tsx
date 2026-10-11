import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PublicProvider, usePublic, type HeaderTone } from '../components/public/PublicContext';

/**
 * Public shell. Kept deliberately thin: header, footer and all public CSS live
 * in a lazy chunk, so PMS routes never download public-only code or styles.
 */
const PublicHeader = lazy(() =>
  import('../components/public/PublicChrome').then((m) => ({ default: m.PublicHeader })),
);
const PublicFooter = lazy(() =>
  import('../components/public/PublicChrome').then((m) => ({ default: m.PublicFooter })),
);

/**
 * Routes whose first block is a dark hero that slides under the header.
 * Derived from the path (synchronously) so the lazy page chunk can never cause
 * a layout shift; the page then flips the header to transparent once mounted.
 */
const DARK_HERO_ROUTES = new Set(['/', '/about', '/rooms', '/gallery', '/contact']);

/**
 * Critical layout rule, shipped with the (static) layout instead of the lazy
 * public.css: on light pages the fixed header overlays the top of <main>, so the
 * offset must exist from the first paint no matter which chunk arrives first.
 * Values mirror --pub-header-h in public.css (64px, 72px from 1024px).
 */
const CRITICAL_CSS =
  '.pub-root[data-tone="light"] .pub-main{padding-top:64px}' +
  '@media (min-width:1024px){.pub-root[data-tone="light"] .pub-main{padding-top:72px}}' +
  // While a page chunk is loading the footer stays invisible: it would otherwise
  // jump from below the fold into view when the real page replaces the fallback.
  '.pub-root:has(.pub-fallback) #pub-footer{visibility:hidden}';

/**
 * Route fallback for public pages: blank (no English "Loading..." flash), tagged
 * for the rule above. When it unmounts the real page has been committed, which
 * is the signal for the layout to fetch header and footer (see PublicLayout).
 */
export function PublicPageFallback() {
  const { markReady } = usePublic();
  useEffect(() => markReady, [markReady]);
  return <div className="pub-fallback" style={{ minHeight: '60dvh' }} aria-hidden="true" />;
}

function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof IntersectionObserver === 'undefined') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The public chrome around any content. Used by PublicLayout (routed pages) and by
 * the 404 page, which lives on its own catch-all route outside the layout.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [tone, setTone] = useState<HeaderTone>('light');
  // Evaluated once: the CSS reduced-motion rules cover later preference changes.
  const [enhanced] = useState<boolean>(motionAllowed);
  // Header and footer are fetched only after the page itself has been committed,
  // so their chunks never compete with the page for bandwidth or the main thread.
  const [chromeReady, setChromeReady] = useState(false);
  const entryPath = useRef(location.pathname);

  const markReady = useCallback(() => setChromeReady(true), []);

  useEffect(() => {
    const timer = window.setTimeout(markReady, 1500);
    return () => window.clearTimeout(timer);
  }, [markReady]);

  // Route fade only after navigating away from the entry page: re-renders of the
  // layout on the first load must never replay it (it would hold back LCP).
  const fade = location.pathname !== entryPath.current;

  const darkHero = DARK_HERO_ROUTES.has(location.pathname.replace(/\/+$/, '') || '/');

  return (
    <PublicProvider value={{ enhanced, tone, setTone, markReady }}>
      <div
        className={`pub-root${enhanced ? ' pub-js' : ''}`}
        data-tone={darkHero ? 'dark' : 'light'}
        style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
      >
        <style>{CRITICAL_CSS}</style>
        {chromeReady && (
          <Suspense fallback={null}>
            <PublicHeader />
          </Suspense>
        )}
        <main id="pub-main" className="pub-main" tabIndex={-1}>
          <div key={location.pathname} className={fade ? 'pub-route pub-route--fade' : 'pub-route'}>
            {children}
          </div>
        </main>
        {chromeReady && (
          <Suspense fallback={null}>
            <PublicFooter />
          </Suspense>
        )}
      </div>
    </PublicProvider>
  );
}

export function PublicLayout() {
  return (
    <PublicShell>
      <Outlet />
    </PublicShell>
  );
}
