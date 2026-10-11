import { test } from '@playwright/test';

test('small targets', async ({ browser }) => {
  for (const [w, h] of [[375, 812], [1440, 900]] as const) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h }, hasTouch: w < 768 });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('a, button, input, select, textarea, summary').forEach((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
        if (r.width < 44 || r.height < 44) {
          out.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || '').trim().slice(0, 28)}"`);
        }
      });
      return out;
    });
    console.log(`SMALL ${w}`, JSON.stringify(found));
    await ctx.close();
  }
});
