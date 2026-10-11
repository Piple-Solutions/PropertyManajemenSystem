import { test } from '@playwright/test';

test('room card hit area + landscape back-to-top', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const c = document.querySelector(".pub-room:not(.pub-room--skeleton)") as HTMLElement | null; c?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }); });
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => {
    const card = document.querySelector('.pub-room:not(.pub-room--skeleton)') as HTMLElement | null;
    if (!card) return { card: false };
    card.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const r = card.getBoundingClientRect();
    const probe = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return el ? `${el.tagName.toLowerCase()}${el.closest('a') ? '(in a)' : ''}` : null;
    };
    return {
      card: true,
      w: Math.round(r.width),
      h: Math.round(r.height),
      topLeft: probe(r.left + 12, r.top + 12),
      center: probe(r.left + r.width / 2, r.top + r.height / 2),
      bottomRight: probe(r.right - 12, r.bottom - 12),
    };
  });
  console.log('HIT', JSON.stringify(res));
  await ctx.close();

  const land = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 812, height: 375 }, hasTouch: true });
  const p2 = await land.newPage();
  await p2.goto('/');
  await p2.waitForTimeout(1800);
  const top = await p2.evaluate(() => document.querySelector('.pub-top')?.getAttribute('data-visible'));
  console.log('LANDSCAPE back-to-top at scroll 0 =', top);
  await land.close();
});
