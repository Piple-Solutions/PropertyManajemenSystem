const fs = require('fs');
let p = 'src/components/public/PublicContext.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
`  tone: HeaderTone;
  setTone: (tone: HeaderTone) => void;
}`,
`  tone: HeaderTone;
  setTone: (tone: HeaderTone) => void;
  /** The routed page has been committed: the layout may now load header and footer. */
  markReady: () => void;
}`);
s = s.replace(`  setTone: () => undefined,
});`, `  setTone: () => undefined,
  markReady: () => undefined,
});`);
fs.writeFileSync(p, s);

p = 'src/layouts/PublicLayout.tsx';
s = fs.readFileSync(p, 'utf8');
s = s.replace("import { PublicProvider, type HeaderTone } from '../components/public/PublicContext';",
              "import { PublicProvider, usePublic, type HeaderTone } from '../components/public/PublicContext';");
s = s.replace(
`/** Route fallback for public pages: blank (no English "Loading..." flash), tagged for the rule above. */
export function PublicPageFallback() {
  return <div className="pub-fallback" style={{ minHeight: '60dvh' }} aria-hidden="true" />;
}`,
`/**
 * Route fallback for public pages: blank (no English "Loading..." flash), tagged
 * for the rule above. When it unmounts the real page has been committed, which
 * is the signal for the layout to fetch header and footer (see PublicLayout).
 */
export function PublicPageFallback() {
  const { markReady } = usePublic();
  useEffect(() => markReady, [markReady]);
  return <div className="pub-fallback" style={{ minHeight: '60dvh' }} aria-hidden="true" />;
}`);
s = s.replace(
`  const [enhanced, setEnhanced] = useState<boolean>(motionAllowed);
  const firstRender = useRef(true);

  const setTone = useCallback((next: HeaderTone) => setToneState(next), []);
`,
`  const [enhanced, setEnhanced] = useState<boolean>(motionAllowed);
  // Header and footer are fetched only after the page itself has been committed,
  // so their chunks never compete with the page for bandwidth or the main thread.
  const [chromeReady, setChromeReady] = useState(false);
  const firstRender = useRef(true);

  const setTone = useCallback((next: HeaderTone) => setToneState(next), []);
  const markReady = useCallback(() => setChromeReady(true), []);

  useEffect(() => {
    const timer = window.setTimeout(markReady, 1500);
    return () => window.clearTimeout(timer);
  }, [markReady]);
`);
s = s.replace('const value = useMemo(() => ({ enhanced, tone, setTone }), [enhanced, tone, setTone]);',
              'const value = useMemo(() => ({ enhanced, tone, setTone, markReady }), [enhanced, tone, setTone, markReady]);');
s = s.replace(
`        <Suspense fallback={null}>
          <PublicHeader />
        </Suspense>`,
`        {chromeReady && (
          <Suspense fallback={null}>
            <PublicHeader />
          </Suspense>
        )}`);
s = s.replace(
`        <Suspense fallback={null}>
          <PublicFooter />
        </Suspense>`,
`        {chromeReady && (
          <Suspense fallback={null}>
            <PublicFooter />
          </Suspense>
        )}`);
fs.writeFileSync(p, s);
console.log('ok');
