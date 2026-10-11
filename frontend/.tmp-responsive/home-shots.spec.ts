import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', 'public-after-home-final', 'shots');

test('home viewport shots', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const jobs: Array<{ name: string; w: number; h: number; target?: string }> = [
    { name: '375-hero', w: 375, h: 812 },
    { name: '375-rooms', w: 375, h: 812, target: '#home-rooms-title' },
    { name: '375-facilities', w: 375, h: 812, target: '#home-fac-title' },
    { name: '768-hero', w: 768, h: 1024 },
    { name: '1440-hero', w: 1440, h: 900 },
    { name: '1440-rooms', w: 1440, h: 900, target: '#home-rooms-title' },
    { name: '1440-facilities', w: 1440, h: 900, target: '#home-fac-title' },
    { name: '812x375-hero', w: 812, h: 375 },
  ];
  for (const j of jobs) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: j.w, height: j.h }, hasTouch: j.w < 768 });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1600);
    if (j.target) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110);
      }, j.target);
      await page.waitForTimeout(1300);
    }
    await page.screenshot({ path: path.join(OUT, `${j.name}.png`) });
    await ctx.close();
  }
});
