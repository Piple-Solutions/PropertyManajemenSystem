/** Calendar behaviour @375 (read-only): tap day -> popup, month nav, holiday month. */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.CAPTURE_OUT || 'after-C');

test('calendar mobile check', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/reservations/calendar?month=2026-10', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /october 2026/i })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1200);

  const r: Record<string, unknown> = {};
  r.pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  r.gridOverflowsCard = await page.evaluate(() => {
    const g = document.querySelector('.cal-grid') as HTMLElement;
    const c = document.querySelector('.cal-card') as HTMLElement;
    return g.scrollWidth > c.clientWidth + 1;
  });
  r.cellSize = await page.evaluate(() => {
    const el = document.querySelector('.cal-cell') as HTMLElement;
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height) };
  });
  r.navButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cal-nav button')).map((b) => {
      const x = b.getBoundingClientRect();
      return `${Math.round(x.width)}x${Math.round(x.height)}`;
    }),
  );

  // Tap Oct 1 (has reservations) -> popup.
  await page.locator('button[aria-label^="2026-10-01"]').click();
  r.popupOpens = await page
    .getByRole('dialog')
    .first()
    .isVisible()
    .catch(() => false);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '375-calendar-popup.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Keyboard: focus a cell and activate with Enter.
  await page.locator('button[aria-label^="2026-10-02"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  r.keyboardOpens = await page.getByRole('dialog').first().isVisible().catch(() => false);
  await page.keyboard.press('Escape');

  // Month navigation + holidays.
  await page.getByRole('button', { name: /next/i }).first().click();
  await expect(page.getByRole('heading', { name: /november 2026/i })).toBeVisible({ timeout: 10000 });
  await page.goto('/dashboard/reservations/calendar?month=2026-12', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /december 2026/i })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  r.holidayMarkers = await page.getByTestId('holiday-marker').count();
  await page.screenshot({ path: path.join(OUT, '375-calendar-dec.png'), fullPage: false });

  fs.writeFileSync(path.join(OUT, 'calendar-check.json'), JSON.stringify(r, null, 2));
});
