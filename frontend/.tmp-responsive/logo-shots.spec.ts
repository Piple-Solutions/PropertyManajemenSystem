/** Header/footer logo states (read-only). Output: public-after-blok3/logo */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', 'public-after-blok3', 'logo');

test('logo shots', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const info: Record<string, unknown> = {};

  const mobile = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true });
  const m = await mobile.newPage();
  await m.goto('/');
  await m.waitForTimeout(1800);
  await m.screenshot({ path: path.join(OUT, 'home-375-top.png'), clip: { x: 0, y: 0, width: 375, height: 76 } });
  info.homeTop = await m.evaluate(() => {
    const vis = [...document.querySelectorAll('.pub-brand__logo')].map((i) => {
      const el = i as HTMLImageElement;
      const r = el.getBoundingClientRect();
      return { cls: el.className.replace('pub-brand__logo ', ''), shown: getComputedStyle(el).display !== 'none', w: Math.round(r.width), h: Math.round(r.height), natural: `${el.naturalWidth}x${el.naturalHeight}`, complete: el.complete };
    });
    const nav = document.querySelector('.pub-menu-btn')?.getBoundingClientRect();
    return { vis, menuBtnLeft: nav ? Math.round(nav.left) : null };
  });
  await m.evaluate(() => window.scrollTo(0, 700));
  await m.waitForTimeout(700);
  await m.screenshot({ path: path.join(OUT, 'home-375-scrolled.png'), clip: { x: 0, y: 0, width: 375, height: 76 } });
  info.homeScrolled = await m.evaluate(() =>
    [...document.querySelectorAll('.pub-brand__logo')].map((i) => ({ cls: (i as HTMLElement).className.replace('pub-brand__logo ', ''), shown: getComputedStyle(i).display !== 'none' })),
  );
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.waitForTimeout(500);
  await m.getByRole('button', { name: /buka menu navigasi/i }).click();
  await m.waitForTimeout(450);
  await m.screenshot({ path: path.join(OUT, 'menu-375.png'), clip: { x: 0, y: 0, width: 375, height: 260 } });
  info.menuOpen = await m.evaluate(() =>
    [...document.querySelectorAll('.pub-brand__logo')].map((i) => ({ cls: (i as HTMLElement).className.replace('pub-brand__logo ', ''), shown: getComputedStyle(i).display !== 'none' })),
  );
  await m.keyboard.press('Escape');
  await m.goto('/about');
  await m.waitForTimeout(1800);
  await m.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await m.waitForTimeout(900);
  const fl = m.locator('.pub-footer__brand');
  await fl.screenshot({ path: path.join(OUT, 'footer-375.png') });
  info.footerLogo = await m.evaluate(() => {
    const i = document.querySelector('.pub-footer__logo') as HTMLImageElement | null;
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), alt: i.alt, complete: i.complete, natural: `${i.naturalWidth}x${i.naturalHeight}` };
  });
  await mobile.close();

  const desk = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const d = await desk.newPage();
  await d.goto('/');
  await d.waitForTimeout(1800);
  await d.screenshot({ path: path.join(OUT, 'home-1440-top.png'), clip: { x: 0, y: 0, width: 1440, height: 84 } });
  await d.goto('/nggak-ada');
  await d.waitForTimeout(1500);
  await d.screenshot({ path: path.join(OUT, 'notfound-1440-top.png'), clip: { x: 0, y: 0, width: 1440, height: 84 } });
  info.notFoundLogos = await d.evaluate(() =>
    [...document.querySelectorAll('.pub-brand__logo')].map((i) => ({ cls: (i as HTMLElement).className.replace('pub-brand__logo ', ''), shown: getComputedStyle(i).display !== 'none' })),
  );
  await desk.close();
  console.log(JSON.stringify(info, null, 1));
});
