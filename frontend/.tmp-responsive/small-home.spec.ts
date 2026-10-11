import { test } from '@playwright/test';
test('small home', async ({ browser }) => {
  for (const [w,h] of [[375,812],[1024,768]] as const) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/'); await page.waitForTimeout(1800);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 500) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(60); }
    const r = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,textarea')].filter((e) => {
      const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && (b.width < 44 || b.height < 44);
    }).map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName}.${String((e as HTMLElement).className).slice(0,40)} ${Math.round(b.width)}x${Math.round(b.height)} "${(e.textContent||'').trim().slice(0,20)}" type=${(e as HTMLInputElement).type||''}`; }));
    console.log(w, JSON.stringify(r));
    await ctx.close();
  }
});
