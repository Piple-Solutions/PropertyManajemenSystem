/**
 * Public-page performance measurement (B4). Chromium + CDP only, no extra packages.
 * Mobile profile: 375x812, DPR 2, Slow 4G (1.6 Mbps down / 150 ms RTT), 4x CPU throttle.
 * 3 runs per page -> median. OUT = PERF_OUT (default public-perf-baseline).
 * NOTE: `vite preview` does not gzip; "transferred" is raw. gzip is computed from dist files.
 */
import { test, type CDPSession } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.PERF_OUT || 'public-perf-baseline');
const PAGES = (process.env.PERF_PAGES || '/,/about,/rooms,/gallery,/contact,/route-tidak-ada-xyz').split(',');
const RUNS = 4;

function gzipSize(file: string): number {
  try {
    return zlib.gzipSync(fs.readFileSync(file)).length;
  } catch {
    return 0;
  }
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('public perf', async ({ browser }) => {
  test.setTimeout(20 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const dist = path.resolve(process.cwd(), 'dist');
  const rows: Array<Record<string, unknown>> = [];

  for (const url of PAGES) {
    const runs: Array<Record<string, number>> = [];
    let jsFiles: string[] = [];
    let cssFiles: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({
        baseURL: 'http://localhost:5173',
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __m: { lcp: number; cls: number; long: number[] } };
        w.__m = { lcp: 0, cls: 0, long: [], sh: [] } as never;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) w.__m.lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => {
          type Src = { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly };
          for (const e of l.getEntries() as unknown as Array<{ value: number; startTime: number; hadRecentInput: boolean; sources?: Src[] }>) {
            if (e.hadRecentInput) continue;
            w.__m.cls += e.value;
            const desc = (e.sources || [])
              .map((x) => {
                const n = x.node as HTMLElement | null;
                const cls = String(n?.className || '').split(' ').slice(0, 2).join('.');
                return `${n?.tagName || '?'}.${cls}[${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)}|h${Math.round(x.previousRect.height)}->${Math.round(x.currentRect.height)}]`;
              })
              .join(' ; ');
            (w.__m as unknown as { sh: string[] }).sh.push(`t=${Math.round(e.startTime)} v=${e.value.toFixed(4)} ${desc}`);
          }
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) w.__m.long.push(e.duration);
        }).observe({ type: 'longtask', buffered: true });
      });
      const cdp: CDPSession = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const reqs = new Map<string, { type: string; url: string; bytes: number }>();
      cdp.on('Network.responseReceived', (e: { requestId: string; type: string; response: { url: string } }) => {
        reqs.set(e.requestId, { type: e.type, url: e.response.url, bytes: 0 });
      });
      cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => {
        const r = reqs.get(e.requestId);
        if (r) r.bytes = e.encodedDataLength;
      });
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3500);
      const shifts = await page.evaluate(() => (window as unknown as { __m: { sh: string[] } }).__m.sh);
      console.log('SHIFTS ' + url + '\n' + shifts.join('\n'));
      const m = await page.evaluate(() => {
        const w = window as unknown as { __m: { lcp: number; cls: number; long: number[] } };
        return {
          lcp: w.__m.lcp,
          cls: w.__m.cls,
          longCount: w.__m.long.length,
          longMax: w.__m.long.length ? Math.max(...w.__m.long) : 0,
          dom: document.querySelectorAll('*').length,
        };
      });
      const list = [...reqs.values()].filter((r) => r.url.startsWith('http://localhost:5173'));
      const sum = (t: string) => list.filter((r) => r.type === t).reduce((a, r) => a + r.bytes, 0);
      const js = list.filter((r) => r.type === 'Script');
      const css = list.filter((r) => r.type === 'Stylesheet');
      jsFiles = js.map((r) => new URL(r.url).pathname);
      cssFiles = css.map((r) => new URL(r.url).pathname);
      runs.push({
        lcp: m.lcp,
        cls: m.cls,
        longCount: m.longCount,
        longMax: m.longMax,
        dom: m.dom,
        requests: list.length,
        jsRaw: sum('Script'),
        cssRaw: sum('Stylesheet'),
        fontRaw: sum('Font'),
        imgRaw: sum('Image'),
      });
      await ctx.close();
    }
    const med = (k: string) => median(runs.map((r) => r[k]));
    const jsGz = jsFiles.reduce((a, f) => a + gzipSize(path.join(dist, f)), 0);
    const cssGz = cssFiles.reduce((a, f) => a + gzipSize(path.join(dist, f)), 0);
    rows.push({
      page: url,
      lcpMs: Math.round(med('lcp')),
      cls: +med('cls').toFixed(4),
      longTasks: med('longCount'),
      longTaskMaxMs: Math.round(med('longMax')),
      domNodes: med('dom'),
      requests: med('requests'),
      jsKbRaw: +(med('jsRaw') / 1024).toFixed(1),
      cssKbRaw: +(med('cssRaw') / 1024).toFixed(1),
      jsKbGzip: +(jsGz / 1024).toFixed(1),
      cssKbGzip: +(cssGz / 1024).toFixed(1),
      fontKb: +(med('fontRaw') / 1024).toFixed(1),
      imgKb: +(med('imgRaw') / 1024).toFixed(1),
      jsFiles,
      cssFiles,
      allRuns: runs,
    });
    console.log(`${url} lcp=${Math.round(med('lcp'))}ms cls=${med('cls').toFixed(3)} js=${(jsGz / 1024).toFixed(1)}KBgz css=${(cssGz / 1024).toFixed(1)}KBgz req=${med('requests')}`);
  }
  void 0; fs.writeFileSync(path.join(OUT, 'perf-debug.json'), JSON.stringify(rows, null, 2));
});

