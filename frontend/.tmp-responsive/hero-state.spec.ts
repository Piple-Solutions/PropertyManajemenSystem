import { test } from '@playwright/test';
import * as path from 'path';

test('hero state', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const d = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width), op: cs.opacity, vis: cs.visibility, color: cs.color, anim: cs.animationName, tf: cs.transform };
    };
    return { lead: d(q('.pub-hero .pub-lead')), h1: d(q('#home-title')), eyebrow: d(q('.pub-hero .pub-eyebrow')), avail: d(q('.pub-avail__sub')), hero: d(q('.pub-hero')) };
  });
  console.log('HERO', JSON.stringify(info));
  await page.screenshot({ path: path.resolve('.tmp-responsive', 'hero-state-375.png') });
});
