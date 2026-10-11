// Home: mount the below-the-fold sections in two batches (each batch gets its own task).
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src/pages/HomePage.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  s = s.replace(a, b);
};
const hookStart = s.indexOf('/**\n * True once the first frame has been painted.');
const hookEnd = s.indexOf('/** Stagger index for the entrance animation');
if (hookStart < 0 || hookEnd < 0) throw new Error('hook block');
const hook = `/**
 * Staged mount: 0 = hero only, 1 = first batch below the fold, 2 = everything.
 * Each step waits for the previous one to be painted (two frames), so the hero
 * commits first and no single task has to render the whole page (long tasks hurt
 * input latency on phones). A timer covers tabs where requestAnimationFrame is paused.
 */
function useStagedMount(stages: number): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= stages) return undefined;
    let done = false;
    let raf2 = 0;
    const advance = () => {
      if (done) return;
      done = true;
      setStage(stage + 1);
    };
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(advance);
    });
    const timer = window.setTimeout(advance, 400);
    return () => {
      done = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [stage, stages]);
  return stage;
}

`;
s = s.slice(0, hookStart) + hook + s.slice(hookEnd);
rep('  const belowFold = useAfterFirstPaint();', '  const stage = useStagedMount(2);');
rep(
  "      {!belowFold && <div className=\"pub-fallback\" style={{ minHeight: '100dvh' }} aria-hidden=\"true\" />}\n      {belowFold && (\n        <>\n",
  "      {stage < 2 && <div className=\"pub-fallback\" style={{ minHeight: '100dvh' }} aria-hidden=\"true\" />}\n      {stage >= 1 && (\n        <>\n",
);
rep(
  "          {/* 6. Facilities (varied tiles) */}",
  "        </>\n      )}\n      {stage >= 2 && (\n        <>\n          {/* 6. Facilities (varied tiles) */}",
);
fs.writeFileSync(p, s);
console.log('ok');
