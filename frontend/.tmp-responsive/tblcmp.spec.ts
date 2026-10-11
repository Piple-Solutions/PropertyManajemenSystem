import { test } from '@playwright/test';
import { loginAsAdmin } from '../e2e/helpers';
test('compare tables', async ({ page }) => {
  await loginAsAdmin(page);
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dashboard/finance/sales', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const pick = (title: string) => {
        const h3 = [...document.querySelectorAll('h3')].find((e) => (e.textContent || '').includes(title))!;
        const card = h3.parentElement as HTMLElement;
        const t = card.querySelector('table') as HTMLElement;
        const th = t.querySelector('th:last-child') as HTMLElement;
        const td = t.querySelector('td:last-child') as HTMLElement;
        const cs = (e: HTMLElement) => getComputedStyle(e);
        return {
          cardPad: cs(card).padding,
          thFont: cs(th).fontSize, thLS: cs(th).letterSpacing, thAlign: cs(th).textAlign, thPad: cs(th).padding,
          tdFont: cs(td).fontSize, tdAlign: cs(td).textAlign, tdPad: cs(td).padding,
          tableLayout: cs(t).tableLayout,
        };
      };
      return { revenue: pick('Revenue by Source'), history: pick('Riwayat Transaksi') };
    });
    const same = JSON.stringify(r.revenue) === JSON.stringify(r.history);
    console.log(`${w}: identical=${same}`);
    if (!same) console.log(JSON.stringify(r));
  }
});
