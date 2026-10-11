/**
 * Per-step capture (READ-ONLY navigation). Reuses e2e/helpers loginAsAdmin.
 * CAPTURE_OUT = folder under .tmp-responsive; CAPTURE_VPS = optional extra
 * viewports, e.g. "430x932,1024x768". No form is submitted.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.CAPTURE_OUT || 'after-step');
const BASE_VPS = ['375x812', '768x1024', '1440x900'];
const EXTRA = (process.env.CAPTURE_VPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const VPS = [...BASE_VPS, ...EXTRA].map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { name: s, width: w, height: h };
});

const PAGES: Array<[string, string]> = [
  ['dashboard', '/dashboard'],
  ['reservation-list', '/dashboard/reservations'],
  ['reservation-calendar', '/dashboard/reservations/calendar?month=2026-10'],
  ['reservation-wizard-new', '/dashboard/reservations/new'],
  ['room-list', '/dashboard/rooms'],
  ['invoice-list', '/dashboard/finance/invoices'],
  ['user-list', '/dashboard/users'],
  ['contact-public', '/contact'],
];

test('step capture', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await loginAsAdmin(page);
  const metrics: Array<Record<string, unknown>> = [];
  for (const vp of VPS) {
    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, url] of PAGES) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      const m = await page.evaluate((vw: number) => {
        const de = document.documentElement;
        const q = (s: string) => Array.from(document.querySelectorAll(s));
        const visible = (el: Element) => {
          const cs = getComputedStyle(el as HTMLElement);
          if (cs.visibility === 'hidden' || cs.display === 'none') return false;
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        let small = 0;
        for (const el of q('button, a, input, select, textarea, [role=button]')) {
          if (!visible(el)) continue;
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.width < 44 || r.height < 44) small++;
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let smallText = 0;
        let node: Node | null = walker.nextNode();
        while (node) {
          const t = (node.textContent || '').trim();
          const p = node.parentElement;
          if (t && p && visible(p) && parseFloat(getComputedStyle(p).fontSize) < 12) smallText++;
          node = walker.nextNode();
        }
        const inputs = q('input, select, textarea').filter((el) => {
          const ty = (el as HTMLInputElement).type;
          return visible(el) && !['checkbox', 'radio', 'hidden', 'range'].includes(ty);
        });
        const inputMin = inputs.length
          ? Math.min(...inputs.map((el) => parseFloat(getComputedStyle(el).fontSize)))
          : null;
        const wide = q('body *')
          .filter((el) => visible(el) && (el as HTMLElement).getBoundingClientRect().right > vw + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]}`);
        const side = document.querySelector('.pms-side') as HTMLElement | null;
        const sideVisible = side && getComputedStyle(side).visibility !== 'hidden';
        return {
          htmlFont: getComputedStyle(de).fontSize,
          bodyFont: getComputedStyle(document.body).fontSize,
          pageOverflow: de.scrollWidth > de.clientWidth + 1 || (() => { const m = document.querySelector('.pms-main') as HTMLElement | null; return !!m && m.scrollWidth > m.clientWidth + 1; })(),
          docScrollWidth: de.scrollWidth,
          sideShare: side && sideVisible ? +(side.getBoundingClientRect().width / vw).toFixed(3) : 0,
          smallTargets: small,
          smallText,
          inputMin,
          wideOffscreen: wide,
          docHeight: de.scrollHeight,
        };
      }, vp.width);
      metrics.push({ viewport: vp.name, page: name, ...m });
    }
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
});
