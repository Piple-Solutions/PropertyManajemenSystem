import { test } from '@playwright/test';
test('hero shot 768', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '.tmp-responsive/public-after-home/hero-768-viewport.png' });
  const r = await page.evaluate(() => {
    const e = document.querySelector('.pub-hero__media') as HTMLElement;
    const b = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const m = document.querySelector('.pub-hero__media .pub-media') as HTMLElement;
    const mb = m.getBoundingClientRect();
    return { wrap: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], display: cs.display, op: cs.opacity, media: [Math.round(mb.x), Math.round(mb.y), Math.round(mb.width), Math.round(mb.height)] };
  });
  console.log('HEROMEDIA', JSON.stringify(r));
});
