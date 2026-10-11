import { test } from '@playwright/test';

/** What is the LCP element, and what does the resource waterfall look like under the mobile perf profile? */
test('lcp debug', async ({ browser }) => {
  const url = process.env.LCP_URL || '/';
  const ctx = await browser.newContext({
    baseURL: process.env.LCP_ORIGIN || 'http://localhost:5173',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: process.env.LCP_RM ? 'reduce' : 'no-preference',
  });
  await ctx.route(/fonts.(googleapis|gstatic).com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const win = window as unknown as { __lcp: string[] };
    win.__lcp = [];
    const marks: string[] = ((win as unknown as { __marks?: string[] }).__marks = []);
    const seen = new Set<string>();
    new MutationObserver(() => {
      for (const sel of ['.pub-header', '#home-title', '.pub-avail', '.pub-footer', 'main > .pub-route > .pub-fallback']) {
        if (!seen.has(sel) && document.querySelector(sel)) { seen.add(sel); marks.push(sel + ' @' + Math.round(performance.now())); }
      }
    }).observe(document, { subtree: true, childList: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) marks.push('LONG ' + Math.round(e.startTime) + '+' + Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ startTime: number; size: number; element?: Element | null; url?: string; renderTime: number }>) {
        const el = e.element as HTMLElement | null;
        win.__lcp.push(
          `t=${Math.round(e.startTime)} size=${e.size} ${el?.tagName}.${String(el?.className || '').slice(0, 30)} "${(el?.textContent || '').trim().slice(0, 30)}"`,
        );
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
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
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const win = window as unknown as { __lcp: string[] };
    const res = performance.getEntriesByType('resource').map((e) => {
      const x = e as PerformanceResourceTiming;
      return `${Math.round(x.startTime)}->${Math.round(x.responseEnd)}ms ${x.name.replace(location.origin, '')} (${Math.round(x.encodedBodySize / 1024)}KB)`;
    });
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { marks: (win as unknown as { __marks: string[] }).__marks, lcp: win.__lcp, res, fcp: Math.round(fcp || 0), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) };
  });
  console.log(`FCP=${r.fcp} DCL=${r.dcl} load=${r.load}`);
  console.log('MARKS\n' + r.marks.join('\n'));
  console.log('LCP\n' + r.lcp.join('\n'));
  console.log('RES\n' + r.res.join('\n'));
});
