/** Floor map @375/@768: fit, room sizes, popup (read-only: selecting a room only fetches occupancy). */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.CAPTURE_OUT || 'addendum-after-3');

test('floor map check', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await loginAsAdmin(page);
  const res: Record<string, unknown> = {};
  for (const [w, h] of [[375, 812], [768, 1024]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dashboard/rooms', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const map = document.querySelector('.fmc-map') as HTMLElement;
      const card = map.closest('div[style*="border-radius"]') as HTMLElement;
      const rooms = [...map.querySelectorAll('[data-room-id][role="button"]')] as HTMLElement[];
      const sizes = rooms.map((r) => r.getBoundingClientRect()).map((b) => Math.min(b.width, b.height));
      const labels = [...map.querySelectorAll('span')].map((s) => parseFloat(getComputedStyle(s).fontSize));
      const de = document.documentElement;
      const main = document.querySelector('.pms-main') as HTMLElement;
      return {
        mapW: Math.round(map.getBoundingClientRect().width),
        mapH: Math.round(map.getBoundingClientRect().height),
        cardW: Math.round(card.getBoundingClientRect().width),
        rooms: rooms.length,
        minRoomPx: Math.round(Math.min(...sizes)),
        medianRoomPx: Math.round(sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]),
        belowTarget: sizes.filter((s) => s < 44).length,
        minLabelPx: Math.min(...labels),
        pageOverflow: de.scrollWidth > de.clientWidth + 1 || main.scrollWidth > main.clientWidth + 1,
        mapScrollable: map.scrollWidth > map.clientWidth + 1,
      };
    });
    res[`${w}x${h}`] = m;
    await page.screenshot({ path: path.join(OUT, `${w}x${h}-floormap.png`), fullPage: false });
    // open the first room's popup
    const first = page.locator('.fmc-map [data-room-id][role="button"]').first();
    await first.click({ force: true });
    await page.waitForTimeout(1200);
    const pop = page.locator('.fmc-popup');
    res[`${w}x${h}-popup`] = {
      visible: await pop.isVisible().catch(() => false),
      box: await pop.boundingBox().catch(() => null),
    };
    await page.screenshot({ path: path.join(OUT, `${w}x${h}-floormap-popup.png`), fullPage: false });
    await page.keyboard.press('Escape');
  }
  fs.writeFileSync(path.join(OUT, 'floormap-check.json'), JSON.stringify(res, null, 2));
});
