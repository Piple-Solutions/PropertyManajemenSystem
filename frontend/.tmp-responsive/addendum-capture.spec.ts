/**
 * Addendum capture (READ-ONLY navigation). OUT = CAPTURE_OUT folder under .tmp-responsive.
 * Public login is captured without auth; other pages reuse e2e/helpers loginAsAdmin.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.CAPTURE_OUT || 'addendum-after');
const parse = (s: string) => {
  const [w, h] = s.split('x').map(Number);
  return { name: s, width: w, height: h };
};
const LOGIN_VPS = ['320x568', '360x640', '375x812', '430x932', '768x1024', '1024x768', '812x375', '1440x900'].map(parse);
const APP_VPS = ['375x812', '768x1024', '1440x900'].map(parse);
const APP_PAGES: Array<[string, string]> = [
  ['sales', '/dashboard/finance/sales'],
  ['reports', '/dashboard/finance/reports'],
  ['room-list', '/dashboard/rooms'],
  ['reservation-list', '/dashboard/reservations'],
  ['invoice-list', '/dashboard/finance/invoices'],
  ['user-list', '/dashboard/users'],
];

const METRICS_FN = `(() => {
  const de = document.documentElement;
  const vw = window.innerWidth;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const main = document.querySelector('.pms-main');
  const pageOverflow = de.scrollWidth > de.clientWidth + 1 || (main ? main.scrollWidth > main.clientWidth + 1 : false);
  // elements crossing the viewport edge (ignore ones inside an overflow-x scroller)
  const inScroller = (el) => { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.scrollWidth > p.clientWidth) return true; p = p.parentElement; } return false; };
  const wide = [...document.querySelectorAll('body *')].filter((el) => vis(el) && el.getBoundingClientRect().right > vw + 1 && !inScroller(el)).slice(0, 6).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
  // text nodes below floors
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t10 = 0, t11 = 0, t12 = 0, n = w.nextNode();
  while (n) { const s = (n.textContent || '').trim(); const p = n.parentElement; if (s && p && vis(p)) { const f = parseFloat(getComputedStyle(p).fontSize); if (f < 10) t10++; if (f < 11) t11++; if (f < 12) t12++; } n = w.nextNode(); }
  // overlap of sibling content boxes inside flex rows / grids
  const overlaps = [];
  const rects = (el) => [...el.children].filter(vis).map((c) => ({ c, r: c.getBoundingClientRect() }));
  for (const row of document.querySelectorAll('main *, .pms-main *, .auth-split *')) {
    const cs = getComputedStyle(row);
    if (cs.display !== 'flex' && cs.display !== 'grid' && cs.display !== 'inline-flex') continue;
    const rs = rects(row);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i].r, b = rs[j].r;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 2 && iy > 2 && (rs[i].c.textContent || '').trim() && (rs[j].c.textContent || '').trim()) {
        overlaps.push((row.className || row.tagName) + ' :: ' + (rs[i].c.textContent || '').trim().slice(0, 14) + ' x ' + (rs[j].c.textContent || '').trim().slice(0, 14));
      }
    }
  }
  // own-box clipping: content wider than its box
  const clipped = [...document.querySelectorAll('.pms-main *')].filter((el) => vis(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible' && el.children.length === 0 && (el.textContent || '').trim()).slice(0, 5).map((el) => (el.textContent || '').trim().slice(0, 18));
  // table rows
  const rows = [...document.querySelectorAll('table tbody tr')].filter(vis);
  const avgRow = rows.length ? Math.round(rows.reduce((a, r) => a + r.getBoundingClientRect().height, 0) / rows.length) : null;
  const cellFont = rows.length ? parseFloat(getComputedStyle(rows[0].querySelector('td')).fontSize) : null;
  const cellPad = rows.length ? getComputedStyle(rows[0].querySelector('td')).paddingTop : null;
  const inputsBelow16 = [...document.querySelectorAll('input, select, textarea')].filter((el) => vis(el) && !['checkbox','radio','hidden','range'].includes(el.type) && parseFloat(getComputedStyle(el).fontSize) < 16).length;
  let small = 0; document.querySelectorAll('button, a, input, select, textarea, [role=button]').forEach((el) => { if (!vis(el)) return; const r = el.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small++; });
  return { pageOverflow, wide, textBelow10: t10, textBelow11: t11, textBelow12: t12, overlaps: overlaps.slice(0, 8), overlapCount: overlaps.length, clipped, tableRows: rows.length, avgRowH: avgRow, cellFont, cellPad, inputsBelow16, targetsBelow44: small, docH: de.scrollHeight };
})()`;

test('addendum capture', async ({ page, browser }) => {
  test.setTimeout(15 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const metrics: Array<Record<string, unknown>> = [];

  // Public login: fresh unauthenticated context.
  const pub = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const lp = await pub.newPage();
  for (const vp of LOGIN_VPS) {
    await lp.setViewportSize({ width: vp.width, height: vp.height });
    await lp.goto('/login', { waitUntil: 'domcontentloaded' });
    await lp.waitForTimeout(700);
    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    await lp.screenshot({ path: path.join(dir, 'login.png'), fullPage: true });
    const m = await lp.evaluate(METRICS_FN);
    metrics.push({ viewport: vp.name, page: 'login', ...(m as object) });
  }
  await pub.close();

  await loginAsAdmin(page);
  for (const vp of APP_VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, url] of APP_PAGES) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      const m = await page.evaluate(METRICS_FN);
      metrics.push({ viewport: vp.name, page: name, ...(m as object) });
    }
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
});
