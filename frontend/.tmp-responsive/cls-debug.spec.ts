import { test } from '@playwright/test';
test('cls debug', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: unknown[] };
    w.__shifts = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ value: number; startTime: number; hadRecentInput: boolean; sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
        w.__shifts.push({
          t: Math.round(e.startTime),
          v: +e.value.toFixed(4),
          src: (e.sources || []).map((s) => {
            const n = s.node as HTMLElement | null;
            return `${n?.tagName?.toLowerCase()}.${String(n?.className || '').split(' ').slice(0, 2).join('.')} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`;
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/');
  await page.waitForTimeout(500);
  const phase1 = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts.slice());
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 560) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(200);
  }
  const all = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts.slice());
  console.log('LOAD', JSON.stringify(phase1));
  console.log('ALL', JSON.stringify(all.slice(phase1.length)));
});
