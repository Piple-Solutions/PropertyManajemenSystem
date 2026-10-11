import { test } from '@playwright/test';

/** Layout-shift sources + geometry timeline under the mobile perf profile (Slow 4G, 4x CPU). */
test('cls debug 5', async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: 'http://localhost:5173',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  if (process.env.NOLOG) await page.addInitScript(() => { (window as unknown as { __nolog?: boolean }).__nolog = true; });
  await page.addInitScript(() => {
    const win = window as unknown as { __shifts: string[]; __log: string[] };
    win.__shifts = [];
    win.__log = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{
        value: number;
        startTime: number;
        hadRecentInput: boolean;
        sources?: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
      }>) {
        if (e.hadRecentInput) continue;
        win.__shifts.push(
          `t=${Math.round(e.startTime)} v=${e.value.toFixed(4)} ` +
            (e.sources || [])
              .map((s) => {
                const n = s.node as HTMLElement | null;
                return `${n?.tagName?.toLowerCase()}.${String(n?.className || '').split(' ').slice(0, 2).join('.')}[${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}|h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}]`;
              })
              .join(' ; '),
        );
      }
    }).observe({ type: 'layout-shift', buffered: true });
    let last = '';
    const snap = (why: string) => {
      const main = document.querySelector('main');
      const root = document.querySelector('.pub-root') as HTMLElement | null;
      const hdr = document.querySelector('.pub-header');
      const ftr = document.querySelector('#pub-footer');
      const kid = main?.firstElementChild?.firstElementChild as HTMLElement | null;
      const mr = main?.getBoundingClientRect();
      const kr = kid?.getBoundingClientRect();
      const s =
        `main[y=${mr ? Math.round(mr.y) : '-'} h=${mr ? Math.round(mr.height) : '-'} pt=${main ? getComputedStyle(main).paddingTop : '-'}] ` +
        `kid=${kid?.tagName}.${String(kid?.className || '').slice(0, 24)}[y=${kr ? Math.round(kr.y) : '-'} h=${kr ? Math.round(kr.height) : '-'}] ` +
        `hdr=${hdr ? 'Y' : 'n'} ftr=${ftr ? 'Y' : 'n'} tone=${root?.dataset.tone ?? '-'} sheets=${document.styleSheets.length}`;
      if (s !== last) {
        win.__log.push(`${Math.round(performance.now())}ms [${why}] ${s}`);
        last = s;
      }
    };
    if (!(window as unknown as { __nolog?: boolean }).__nolog) new MutationObserver(() => snap('mut')).observe(document, { subtree: true, childList: true, attributes: true });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(process.env.CLS_URL || '/rooms', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const win = window as unknown as { __shifts: string[]; __log: string[] };
    return { shifts: win.__shifts, log: win.__log };
  });
  console.log('SHIFTS\n' + r.shifts.join('\n'));
  console.log('LOG\n' + r.log.join('\n'));
});
