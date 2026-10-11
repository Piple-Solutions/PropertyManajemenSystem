/** Layout-shift sources under the mobile perf profile (Slow 4G, CPU 4x). Read-only. */
import { test } from '@playwright/test';

const PAGES = (process.env.CLS_PAGES || '/rooms').split(',');
const RUNS = Number(process.env.CLS_RUNS || 4);

test('cls debug 7', async ({ browser }) => {
  test.setTimeout(8 * 60 * 1000);
  for (const url of PAGES) {
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({
        baseURL: process.env.CLS_ORIGIN || 'http://localhost:5173',
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      if (process.env.CLS_ABORT_API) await ctx.route('**/api/public/room-types', (r) => r.abort());
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __shifts: string[]; __marks: string[] };
        w.__shifts = [];
        w.__marks = [];
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as Array<{ value: number; startTime: number; sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
            const src = (e.sources || [])
              .map((s) => {
                const n = s.node as Element | null;
                const label = n ? `${n.nodeName.toLowerCase()}.${String((n as HTMLElement).className || '').slice(0, 30)}` : '?';
                return `${label} y:${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h:${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`;
              })
              .join(' | ');
            w.__shifts.push(`t=${Math.round(e.startTime)} v=${e.value.toFixed(4)} ${src}`);
          }
        }).observe({ type: 'layout-shift', buffered: true });
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args: Parameters<typeof fetch>) => {
          const u = String(args[0]);
          const t0 = Math.round(performance.now());
          return origFetch(...args).then((r) => {
            if (u.includes('/api/public/')) w.__marks.push(`fetch ${u.split('/api/')[1]} ${t0}->${Math.round(performance.now())}`);
            return r;
          });
        };
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const r = await page.evaluate(() => ({
        shifts: (window as unknown as { __shifts: string[] }).__shifts,
        marks: (window as unknown as { __marks: string[] }).__marks,
      }));
      console.log(`--- ${url} run ${i + 1}: shifts=${r.shifts.length} marks=${r.marks.join(' ; ')}`);
      r.shifts.forEach((s) => console.log('   ' + s));
      await ctx.close();
    }
  }
});
