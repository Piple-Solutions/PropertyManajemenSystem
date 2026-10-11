/** Blok 3 behaviour checks for About / Rooms / Gallery / Contact / 404 (read-only, no auth). */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.PUB_OUT || 'public-after-blok3');
const ORIGIN = 'http://localhost:5173';
const PAGES: Array<[string, string]> = [
  ['about', '/about'],
  ['rooms', '/rooms'],
  ['gallery', '/gallery'],
  ['contact', '/contact'],
  ['notfound', '/halaman-yang-tidak-ada'],
];

test('blok3 checks', async ({ browser }) => {
  test.setTimeout(10 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const res: Record<string, unknown> = {};

  // ---- Gallery: filter + lightbox (375, touch) ----
  {
    const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('/gallery');
    await page.waitForTimeout(900);
    const g: Record<string, unknown> = {};
    g.initial = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.pub-gt').length,
      count: document.querySelector('.pub-gcount')?.textContent,
      pressed: [...document.querySelectorAll('.pub-chipbtn')].map((b) => b.getAttribute('aria-pressed')),
      uniform: !!document.querySelector('.pub-gt-grid--uniform'),
    }));
    await page.getByRole('button', { name: 'Kamar', exact: true }).click();
    await page.waitForTimeout(400);
    g.filtered = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.pub-gt').length,
      count: document.querySelector('.pub-gcount')?.textContent,
      uniform: !!document.querySelector('.pub-gt-grid--uniform'),
      labels: [...document.querySelectorAll('.pub-gt__cap')].map((e) => e.textContent),
    }));
    await page.getByRole('button', { name: 'Semua', exact: true }).click();
    await page.waitForTimeout(300);

    // open lightbox from the 3rd tile
    const tileBtn = page.locator('.pub-gt__btn').nth(2);
    await tileBtn.scrollIntoViewIfNeeded();
    const tileLabel = await tileBtn.getAttribute('aria-label');
    await tileBtn.click();
    await page.waitForTimeout(350);
    const lb = () =>
      page.evaluate(() => {
        const d = document.querySelector('.pub-lb') as HTMLElement | null;
        const ae = document.activeElement as HTMLElement | null;
        const main = document.getElementById('pub-main') as (HTMLElement & { inert?: boolean }) | null;
        const header = document.querySelector('.pub-header') as (HTMLElement & { inert?: boolean }) | null;
        return {
          open: !!d,
          role: d?.getAttribute('role'),
          modal: d?.getAttribute('aria-modal'),
          focusInside: !!(d && ae && d.contains(ae)),
          focusLabel: ae?.getAttribute('aria-label') ?? null,
          caption: d?.querySelector('.pub-lb__caption')?.textContent ?? null,
          bodyOverflow: document.body.style.overflow || 'unset',
          mainInert: !!main?.inert,
          headerInert: !!header?.inert,
          parentIsRoot: d?.parentElement?.classList.contains('pub-root') ?? false,
          frame: d?.querySelector('.pub-lb__frame') ? Math.round((d.querySelector('.pub-lb__frame') as HTMLElement).getBoundingClientRect().width) : null,
        };
      });
    g.openState = { tile: tileLabel, ...(await lb()) };
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    g.afterRight = (await lb()).caption;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);
    g.afterLeftLeft = (await lb()).caption;
    // Tab trap
    let escaped = false;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      if (!(await lb()).focusInside) escaped = true;
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      if (!(await lb()).focusInside) escaped = true;
    }
    g.tabEscaped = escaped;
    // Swipe left via CDP touch events -> next
    const cdp = await ctx.newCDPSession(page);
    const before = (await lb()).caption;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    g.swipe = { before, after: (await lb()).caption };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    g.afterEscape = await lb();
    g.focusReturnedToTile = (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label'))) === tileLabel;
    // open again and close with the button
    await tileBtn.click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /tutup pratinjau/i }).click();
    await page.waitForTimeout(250);
    g.afterCloseButton = { open: (await lb()).open, bodyOverflow: (await lb()).bodyOverflow, mainInert: (await lb()).mainInert };
    res.gallery = g;
    await ctx.close();
  }

  // ---- Rooms: batches + sample fallback ----
  {
    const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto('/rooms');
    await page.waitForTimeout(1200);
    const r: Record<string, unknown> = {};
    const cards = () => page.locator('.pub-rooms--page > .pub-room').count();
    r.initialCards = await cards();
    r.status = await page.locator('.pub-more p').textContent();
    let clicks = 0;
    while ((await page.getByRole('button', { name: /tampilkan kamar lainnya/i }).count()) > 0 && clicks < 8) {
      await page.getByRole('button', { name: /tampilkan kamar lainnya/i }).click();
      await page.waitForTimeout(250);
      clicks++;
    }
    r.afterAllCards = await cards();
    r.clicks = clicks;
    r.finalStatus = await page.locator('.pub-more p').textContent();
    r.focusOnStatus = await page.evaluate(() => document.activeElement?.closest('.pub-more') !== null);
    r.waLinks = await page.locator('.pub-rooms--page a[href*="wa.me"]').count();
    r.firstWaText = await page.locator('.pub-rooms--page a[href*="wa.me"]').first().evaluate((a) => ({ href: decodeURIComponent((a as HTMLAnchorElement).href).slice(0, 90), name: a.textContent }));
    await ctx.close();

    // API failure -> sample rooms + note
    const ctx2 = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 375, height: 812 } });
    const p2 = await ctx2.newPage();
    await p2.route('**/api/public/room-types', (rt) => rt.abort());
    await p2.goto('/rooms');
    await p2.waitForTimeout(1200);
    r.apiDown = await p2.evaluate(() => ({
      cards: document.querySelectorAll('.pub-rooms--page > .pub-room').length,
      names: [...document.querySelectorAll('.pub-rooms--page .pub-h3')].map((e) => e.textContent),
      note: document.querySelector('.pub-sh .pub-muted')?.textContent ?? null,
    }));
    await ctx2.close();
    res.rooms = r;
  }

  // ---- Contact + 404 + header tone per page ----
  {
    const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const c: Record<string, unknown> = {};
    await page.goto('/contact');
    await page.waitForTimeout(900);
    c.h1 = await page.getByRole('heading', { name: /hubungi kami/i }).count();
    c.waLinks = await page.locator('a[href*="wa.me"]').count();
    c.title = await page.title();
    const tones: Record<string, unknown> = {};
    for (const [name, url] of PAGES) {
      await page.goto(url);
      await page.waitForTimeout(1000);
      const top = await page.evaluate(() => document.querySelector('.pub-header')?.getAttribute('data-solid'));
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(500);
      const scrolled = await page.evaluate(() => document.querySelector('.pub-header')?.getAttribute('data-solid'));
      const current = await page.evaluate(() => document.querySelector('.pub-nav [aria-current="page"]')?.textContent ?? null);
      const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent ?? null);
      tones[name] = { solidAtTop: top, solidScrolled: scrolled, navCurrent: current, h1, title: await page.title() };
    }
    c.tones = tones;
    // 404 links
    await page.goto('/halaman-yang-tidak-ada');
    await page.waitForTimeout(900);
    c.notFound = await page.evaluate(() => ({
      header: !!document.querySelector('.pub-header'),
      footer: !!document.querySelector('#pub-footer'),
      links: [...document.querySelectorAll('.pub-notfound a')].map((a) => `${a.textContent}->${a.getAttribute('href')}`),
      body404: /404|tidak ditemukan/i.test(document.body.innerText),
    }));
    await page.getByRole('link', { name: 'Kembali ke Beranda' }).click();
    await page.waitForTimeout(800);
    c.backHome = page.url();
    // PMS unknown path also gets the public 404
    await page.goto('/dashboard/xyz-tidak-ada');
    await page.waitForTimeout(1200);
    c.pmsUnknown = { url: page.url(), has404: /tidak ditemukan/i.test(await page.evaluate(() => document.body.innerText)) };
    res.contactAnd404 = c;
    await ctx.close();
  }

  // ---- Reduced motion + no IntersectionObserver + scroll-through, per page ----
  {
    const rm: Record<string, unknown> = {};
    for (const [name, url] of PAGES) {
      const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(url);
      await page.waitForTimeout(700);
      const hiddenRM = await page.evaluate(() => [...document.querySelectorAll('.pub-reveal, .pub-enter')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length);
      await ctx.close();

      const ctx2 = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 375, height: 812 } });
      const p2 = await ctx2.newPage();
      await p2.addInitScript(() => {
        // @ts-expect-error simulate an old browser
        delete window.IntersectionObserver;
      });
      await p2.goto(url);
      await p2.waitForTimeout(800);
      const hiddenNoIO = await p2.evaluate(() => [...document.querySelectorAll('.pub-reveal')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length);
      await ctx2.close();

      const ctx3 = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 375, height: 812 } });
      const p3 = await ctx3.newPage();
      await p3.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await p3.goto(url);
      await p3.waitForTimeout(1200);
      const total = await p3.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 560) {
        await p3.evaluate((t) => window.scrollTo(0, t), y);
        await p3.waitForTimeout(150);
      }
      await p3.waitForTimeout(800);
      const after = await p3.evaluate(() => ({
        hidden: [...document.querySelectorAll('.pub-reveal')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
        reveals: document.querySelectorAll('.pub-reveal').length,
        cls: +(window as unknown as { __cls: number }).__cls.toFixed(4),
      }));
      await ctx3.close();
      rm[name] = { hiddenReducedMotion: hiddenRM, hiddenNoIO, ...after };
    }
    res.motion = rm;
  }

  // ---- Overflow sweep, all pages x all viewports ----
  {
    const page = await (await browser.newContext({ baseURL: ORIGIN })).newPage();
    const sweep: Record<string, Record<string, number>> = {};
    for (const [name, url] of PAGES) {
      sweep[name] = {};
      for (const [w, h] of [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [812, 375]] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(url);
        await page.waitForTimeout(450);
        sweep[name][`${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      }
    }
    res.overflow = sweep;
  }

  fs.writeFileSync(path.join(OUT, 'checks-blok3.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
});
