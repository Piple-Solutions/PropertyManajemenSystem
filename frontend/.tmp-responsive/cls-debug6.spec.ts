/** Which elements shift on the inner pages (non-forcing observer, sources recorded). */
import { test } from '@playwright/test';

const PAGES = (process.env.CLS_PAGES || '/gallery,/rooms,/contact').split(',');

test('cls debug 6', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);
  for (const stub of [false, true]) {
    for (const url of PAGES) {
      const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 } });
      if (stub) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __shifts: string[] };
        w.__shifts = [];
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; startTime: number; sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
            const src = (e.sources || [])
              .map((s) => {
                const n = s.node as Element | null;
                const label = n ? `${n.nodeName.toLowerCase()}.${String((n as HTMLElement).className || '').slice(0, 36)}` : '?';
                return `${label} y:${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h:${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`;
              })
              .join(' | ');
            w.__shifts.push(`t=${Math.round(e.startTime)} v=${e.value.toFixed(4)} in=${e.hadRecentInput} ${src}`);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 560) {
        await page.evaluate((t) => window.scrollTo(0, t), y);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(800);
      const shifts = await page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts);
      console.log(`\n=== ${url} fontsStubbed=${stub} shifts=${shifts.length}`);
      shifts.forEach((s) => console.log('  ' + s));
      await ctx.close();
    }
  }
});
