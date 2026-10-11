import { test } from '@playwright/test';
test('hero debug', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const info = (s: string) => {
      const e = q(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { s, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), display: cs.display, opacity: cs.opacity, vis: cs.visibility, bg: cs.backgroundImage.slice(0, 40), ar: cs.aspectRatio };
    };
    return [info('.pub-hero__grid'), info('.pub-hero__copy'), info('.pub-hero__media'), info('.pub-hero__media .pub-media'), info('.pub-hero')];
  });
  console.log(JSON.stringify(r, null, 1));
});
