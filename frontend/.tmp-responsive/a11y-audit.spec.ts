/** Blok 4: DOM-level a11y + contrast audit of all public pages (read-only, no packages). */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', 'public-after-blok4');
const PAGES = ['/', '/about', '/rooms', '/gallery', '/contact', '/halaman-tidak-ada'];

test('a11y audit', async ({ browser }) => {
  test.setTimeout(6 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const res: Record<string, unknown> = {};
  for (const [w, h] of [[375, 812], [1440, 900]] as const) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    for (const url of PAGES) {
      await page.goto(url);
      await page.waitForTimeout(1500);
      // scroll through so lazy sections mount and reveal
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 500) {
        await page.evaluate((t) => window.scrollTo(0, t), y);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0));
      const r = await page.evaluate(() => {
        const lum = (c: [number, number, number]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const parse = (s: string): [number, number, number, number] | null => {
          const m = s.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
          return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
        };
        const bgOf = (el: Element): [number, number, number] | null => {
          let cur: Element | null = el;
          while (cur) {
            const cs = getComputedStyle(cur);
            if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url(')) return null; // gradient: skip
            const c = parse(cs.backgroundColor);
            if (c && c[3] > 0.95) return [c[0], c[1], c[2]];
            cur = cur.parentElement;
          }
          return [255, 255, 255];
        };
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.5;
        };
        // headings
        const heads = [...document.querySelectorAll('h1,h2,h3,h4')].filter(visible).map((h) => Number(h.tagName[1]));
        let skips = 0;
        for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) skips++;
        // names
        const nameOf = (el: Element) =>
          (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim();
        const unnamed = [...document.querySelectorAll('a[href],button')].filter(visible).filter((el) => !nameOf(el) && !el.querySelector('img[alt]:not([alt=""])')).map((e) => e.className || e.tagName);
        const imgNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        const brokenRefs = [...document.querySelectorAll('[aria-labelledby],[aria-controls]')]
          .flatMap((e) => (e.getAttribute('aria-labelledby') || e.getAttribute('aria-controls') || '').split(' '))
          .filter((id) => id && !document.getElementById(id));
        // contrast of text elements
        const lows: string[] = [];
        const seen = new Set<string>();
        document.querySelectorAll('p,h1,h2,h3,li,a,button,span,dt,dd,blockquote,label,strong').forEach((el) => {
          if (!visible(el)) return;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
          if (!own) return;
          const cs = getComputedStyle(el);
          const fg = parse(cs.color);
          const bg = bgOf(el);
          if (!fg || !bg) return;
          const a = fg[3];
          const f: [number, number, number] = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
          const L1 = lum(f);
          const L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const need = large ? 3 : 4.5;
          if (ratio < need) {
            const key = `${el.className}|${ratio.toFixed(2)}`;
            if (!seen.has(key)) {
              seen.add(key);
              lows.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent || '').trim().slice(0, 28)}" ${ratio.toFixed(2)}:${need} ${size}px`);
            }
          }
        });
        const lang = document.documentElement.lang;
        const landmarks = ['header', 'nav', 'main', 'footer'].map((t) => `${t}:${document.querySelectorAll(t).length}`).join(' ');
        return { h1: document.querySelectorAll('h1').length, headingSkips: skips, unnamed, imgNoAlt, dupIds, brokenRefs, lows, lang, landmarks, title: document.title };
      });
      res[`${url} @${w}`] = r;
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'a11y.json'), JSON.stringify(res, null, 2));
  for (const [k, v] of Object.entries(res)) {
    const r = v as { h1: number; headingSkips: number; unnamed: string[]; imgNoAlt: number; dupIds: string[]; brokenRefs: string[]; lows: string[]; lang: string };
    console.log(`${k.padEnd(26)} h1=${r.h1} skips=${r.headingSkips} unnamed=${r.unnamed.length} imgNoAlt=${r.imgNoAlt} dupIds=${r.dupIds.length} brokenRefs=${r.brokenRefs.length} lowContrast=${r.lows.length} lang=${r.lang}`);
    r.lows.slice(0, 6).forEach((l) => console.log('     LOW ' + l));
    r.unnamed.slice(0, 3).forEach((l) => console.log('     UNNAMED ' + l));
  }
});
