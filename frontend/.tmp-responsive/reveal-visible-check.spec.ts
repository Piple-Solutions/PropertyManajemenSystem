/** After load, no reveal element that intersects the viewport may still be hidden. Read-only. */
import { test } from '@playwright/test';

const PAGES = ['/', '/about', '/rooms', '/gallery', '/contact'];
const VPS: Array<[number, number]> = [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [812, 375]];

test('reveal visible check', async ({ browser }) => {
  test.setTimeout(8 * 60 * 1000);
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page = await ctx.newPage();
  const out: Record<string, Record<string, number>> = {};
  for (const url of PAGES) {
    out[url] = {};
    for (const [w, h] of VPS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url);
      await page.waitForTimeout(1300);
      out[url][`${w}x${h}`] = await page.evaluate(() => {
        const vh = window.innerHeight;
        return [...document.querySelectorAll('.pub-reveal')].filter((el) => {
          const r = el.getBoundingClientRect();
          const inView = r.top < vh * 0.85 && r.bottom > 0 && r.height > 0;
          return inView && parseFloat(getComputedStyle(el).opacity) < 0.99;
        }).length;
      });
    }
  }
  const bad = Object.entries(out).flatMap(([u, m]) => Object.entries(m).filter(([, n]) => n > 0).map(([vp, n]) => `${u} @ ${vp}: ${n}`));
  console.log('STILL HIDDEN IN VIEW:', bad.length ? bad.join(' | ') : 'none (0 across 45 combinations)');
});
