/** Public Home behaviour checks (read-only): menu a11y, reduced motion, reveal safety, CLS, overflow. */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.PUB_OUT || 'public-after-home');

test('public checks', async ({ browser }) => {
  test.setTimeout(8 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const res: Record<string, unknown> = {};

  // ---- Mobile menu (375) ----
  {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(900);
    const toggle = page.getByRole('button', { name: /buka menu navigasi/i });
    const st = () =>
      page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        const menu = document.getElementById('pub-menu');
        const main = document.getElementById('pub-main') as (HTMLElement & { inert?: boolean }) | null;
        const btn = document.querySelector('.pub-menu-btn') as HTMLElement;
        return {
          expanded: btn.getAttribute('aria-expanded'),
          focusInMenu: !!(ae && menu && menu.contains(ae)),
          focusOnToggle: ae === btn,
          bodyOverflow: document.body.style.overflow || 'unset',
          mainInert: !!main?.inert,
          menuVisible: menu ? getComputedStyle(menu).visibility : null,
          menuH: menu ? Math.round(menu.getBoundingClientRect().height) : null,
        };
      });
    res.menuInitial = await st();
    await toggle.click();
    await page.waitForTimeout(350);
    res.menuOpen = await st();
    // Tab trap: 14 tabs must stay inside toggle + panel
    let escaped = false;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const ae = document.activeElement;
        const hdr = document.querySelector('.pub-header');
        return !!(ae && hdr && hdr.contains(ae));
      });
      if (!inside) escaped = true;
    }
    res.tabEscapedHeader = escaped;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    res.menuAfterEscape = await st();
    // route change closes
    await page.getByRole('button', { name: /buka menu navigasi/i }).click();
    await page.waitForTimeout(350);
    await page.locator('#pub-menu').getByRole('link', { name: /^kamar$/i }).click();
    await page.waitForTimeout(900);
    res.menuAfterNav = { url: page.url(), ...(await st()) };
    await page.screenshot({ path: path.join(OUT, 'menu-after-nav.png') });
    await page.getByRole('button', { name: /buka menu navigasi/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'menu-open-375.png') });
    await ctx.close();
  }

  // ---- Desktop nav + skip link (1440) ----
  {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(800);
    await page.keyboard.press('Tab');
    res.skipLink = await page.evaluate(() => {
      const ae = document.activeElement as HTMLElement;
      const r = ae.getBoundingClientRect();
      return { text: (ae.textContent || '').trim(), top: Math.round(r.top), visible: r.top >= 0 && r.height > 0 };
    });
    res.navCurrent = await page.evaluate(() => document.querySelector('.pub-nav [aria-current="page"]')?.textContent);
    res.titleHome = await page.title();
    await ctx.close();
  }

  // ---- Reduced motion: everything static and visible ----
  {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(600);
    res.reducedMotion = await page.evaluate(() => {
      const root = document.querySelector('.pub-root') as HTMLElement;
      const hidden = [...document.querySelectorAll('.pub-reveal, .pub-enter')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length;
      const total = document.querySelectorAll('.pub-reveal, .pub-enter').length;
      return { hasJsClass: root.classList.contains('pub-js'), hiddenCount: hidden, total };
    });
    await ctx.close();
  }

  // ---- No IntersectionObserver: content must stay visible ----
  {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      // @ts-expect-error simulate an old browser
      delete window.IntersectionObserver;
    });
    await page.goto('/');
    await page.waitForTimeout(800);
    res.noIO = await page.evaluate(() => {
      const root = document.querySelector('.pub-root') as HTMLElement;
      const hidden = [...document.querySelectorAll('.pub-reveal')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length;
      return { hasJsClass: root.classList.contains('pub-js'), hiddenReveal: hidden };
    });
    await ctx.close();
  }

  // ---- Normal: scroll through, nothing left hidden; CLS ----
  for (const [w, h] of [[375, 812], [1440, 900]] as const) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const wnd = window as unknown as { __cls: number };
      wnd.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) wnd.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await page.waitForTimeout(1200);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += Math.round(h * 0.7)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(900);
    res[`scroll${w}`] = await page.evaluate(() => {
      const hidden = [...document.querySelectorAll('.pub-reveal')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length;
      const wnd = window as unknown as { __cls: number };
      return { hiddenAfterScroll: hidden, reveals: document.querySelectorAll('.pub-reveal').length, cls: +wnd.__cls.toFixed(4), backToTopVisible: document.querySelector('.pub-top')?.getAttribute('data-visible') };
    });
    await ctx.close();
  }

  // ---- Overflow sweep ----
  {
    const page = await (await browser.newContext({ baseURL: 'http://localhost:5173' })).newPage();
    const sweep: Record<string, number> = {};
    for (const [w, h] of [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [812, 375]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForTimeout(500);
      sweep[`${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    }
    res.overflow = sweep;
  }

  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
});
