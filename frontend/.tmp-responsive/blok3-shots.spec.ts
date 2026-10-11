/** Viewport-sized shots of the inner pages (read-only). Output: public-after-blok3/shots */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.PUB_OUT || 'public-after-blok3', 'shots');

interface Shot {
  name: string;
  url: string;
  w: number;
  h: number;
  scroll?: number;
  /** Optional selector to click before the shot (e.g. open the lightbox). */
  click?: string;
}

const SHOTS: Shot[] = (JSON.parse(process.env.SHOTS || 'null') as Shot[] | null) ?? [
  { name: 'gallery-375-top', url: '/gallery', w: 375, h: 812 },
  { name: 'gallery-375-grid', url: '/gallery', w: 375, h: 812, scroll: 380 },
  { name: 'gallery-375-lightbox', url: '/gallery', w: 375, h: 812, scroll: 380, click: '.pub-gt__btn' },
  { name: 'contact-375-top', url: '/contact', w: 375, h: 812 },
  { name: 'rooms-768-list', url: '/rooms', w: 768, h: 1024, scroll: 260 },
  { name: 'about-1440-top', url: '/about', w: 1440, h: 900 },
  { name: 'gallery-1440-grid', url: '/gallery', w: 1440, h: 900, scroll: 300 },
  { name: 'notfound-375', url: '/nggak-ada-halaman', w: 375, h: 812 },
];

test('blok3 shots', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: s.w, height: s.h }, hasTouch: s.w < 768 });
    const page = await ctx.newPage();
    await page.goto(s.url, { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    if (s.scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), s.scroll);
      await page.waitForTimeout(900);
    }
    if (s.click) {
      await page.locator(s.click).first().click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`), animations: 'disabled' });
    await ctx.close();
  }
});
