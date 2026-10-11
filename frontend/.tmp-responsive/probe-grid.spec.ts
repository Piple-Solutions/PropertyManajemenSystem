import { test } from '@playwright/test';
import { loginAsAdmin } from '../e2e/helpers';
test('probe', async ({ page }) => {
  await loginAsAdmin(page);
  for (const [w, h] of [[375, 812], [768, 1024]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const url of ['/dashboard/finance/sales', '/dashboard/finance/reports']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const out = await page.evaluate(() => {
        const main = document.querySelector('.pms-main') as HTMLElement;
        const r = (el: Element) => Math.round(el.getBoundingClientRect().width);
        const grids = [...document.querySelectorAll('.fin-grid-2')].map((g) => ({
          tracks: getComputedStyle(g).gridTemplateColumns,
          w: r(g),
          kids: [...g.children].map((c) => ({ w: r(c), sw: (c as HTMLElement).scrollWidth, title: c.querySelector('h3')?.textContent })),
        }));
        const tbls = [...document.querySelectorAll('.tbl')].map((t) => ({ w: r(t), min: getComputedStyle(t).minWidth, wrapW: r(t.parentElement!) }));
        return { mainClient: main.clientWidth, mainScroll: main.scrollWidth, grids, tbls };
      });
      console.log(w, url, JSON.stringify(out));
    }
  }
});
