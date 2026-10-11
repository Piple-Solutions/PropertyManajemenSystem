import { test } from '@playwright/test';
test('cls debug 3', async ({ browser }) => {
  for (const [w, h] of [[375, 812], [1440, 900]] as const) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const wnd = window as unknown as { __cls: number; __shifts: string[] };
      wnd.__cls = 0;
      wnd.__shifts = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as Array<{ value: number; startTime: number; hadRecentInput: boolean; sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
          if (e.hadRecentInput) continue;
          wnd.__cls += e.value;
          wnd.__shifts.push(`t=${Math.round(e.startTime)} v=${e.value.toFixed(4)} ` + (e.sources || []).map((s) => {
            const n = s.node as HTMLElement | null;
            return `${n?.tagName?.toLowerCase()}.${String(n?.className || '').split(' ').slice(0, 2).join('.')}[${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}|h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}]`;
          }).join(' ; '));
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(process.env.CLS_URL || '/');
    await page.waitForTimeout(1200);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += Math.round(h * 0.7)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const x = window as unknown as { __cls: number; __shifts: string[] }; return { cls: x.__cls, shifts: x.__shifts }; });
    console.log(`SHIFTS ${w}`, r.cls.toFixed(4), JSON.stringify(r.shifts));
    await ctx.close();
  }
});
