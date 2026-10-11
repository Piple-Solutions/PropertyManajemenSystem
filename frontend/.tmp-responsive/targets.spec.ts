import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';
test('small targets', async ({ page }) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const out: Record<string, string[]> = {};
  for (const [n, u] of [['room-list','/dashboard/rooms'],['user-list','/dashboard/users'],['invoice-list','/dashboard/finance/invoices'],['dashboard','/dashboard'],['reservation-list','/dashboard/reservations'],['wizard','/dashboard/reservations/new']] as const) {
    await page.goto(u, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    out[n] = await page.evaluate(() => {
      const res: Record<string, number> = {};
      document.querySelectorAll('button, a, input, select, textarea, [role=button]').forEach((el) => {
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        if (r.width < 44 || r.height < 44) {
          const p = el.closest('table') ? 'table ' : el.closest('[class*=fmc], svg') ? 'map ' : '';
          const k = `${p}${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} ${(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,18)}`;
          res[k] = (res[k] || 0) + 1;
        }
      });
      return Object.entries(res).map(([k, v]) => `${v}x ${k}`);
    });
  }
  fs.writeFileSync(path.resolve('.tmp-responsive', 'targets.json'), JSON.stringify(out, null, 2));
});
