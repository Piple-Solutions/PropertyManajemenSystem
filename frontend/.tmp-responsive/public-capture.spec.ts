/** Public pages capture (no auth, read-only). OUT = PUB_OUT folder under .tmp-responsive. */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.PUB_OUT || 'public-baseline');
const VPS = (process.env.PUB_VPS || '375x812,768x1024,1440x900').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { name: s, width: w, height: h };
});
const ALL_PAGES: Array<[string, string]> = [
  ['home', '/'],
  ['about', '/about'],
  ['rooms', '/rooms'],
  ['gallery', '/gallery'],
  ['contact', '/contact'],
  ['notfound', '/route-tidak-ada-xyz'],
];

const ONLY = (process.env.PUB_PAGES || '').split(',').filter(Boolean);
const PAGES = ONLY.length ? ALL_PAGES.filter(([n]) => ONLY.includes(n)) : ALL_PAGES;

test('public capture', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const metrics: Array<Record<string, unknown>> = [];
  for (const vp of VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, url] of PAGES) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      // Make sure deferred (content-visibility) and scroll-revealed content is rendered before the full-page shot.
      await page.addStyleTag({ content: '.pub-route > * { content-visibility: visible !important; }' });
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.max(300, vp.height - 100)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(160);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true, animations: 'disabled' });
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const vw = window.innerWidth;
        const vis = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 1).length;
        let small = 0;
        document.querySelectorAll('a, button, input, select, textarea').forEach((e) => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small++; });
        const h1 = document.querySelectorAll('h1').length;
        const imgNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
        const landmarks = ['header', 'nav', 'main', 'footer'].map((t) => document.querySelectorAll(t).length).join('/');
        return { overflow: de.scrollWidth - de.clientWidth, wide, small, h1, imgNoAlt, landmarks, docH: de.scrollHeight, title: document.title };
      });
      metrics.push({ viewport: vp.name, page: name, ...m });
    }
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
});
