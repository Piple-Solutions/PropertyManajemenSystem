/** CPU profile of a public page load under the mobile profile (4x CPU). Read-only. */
import { test } from '@playwright/test';

test('cpu profile', async ({ browser }) => {
  const url = process.env.PROF_URL || '/about';
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as {
    profile: { nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }>; samples: number[]; timeDeltas: number[] };
  };
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  const byUrl = new Map<string, number>();
  let total = 0;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
    const n = byId.get(id)!;
    const fn = n.callFrame.functionName || '(anon)';
    const u = (n.callFrame.url || '(native)').replace('http://localhost:5173', '');
    const key = `${fn} @ ${u}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) || 0) + dt);
    byUrl.set(u, (byUrl.get(u) || 0) + dt);
    total += dt;
  });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log(`TOTAL sampled ms (throttled): ${total.toFixed(0)}`);
  console.log('BY URL');
  [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([u, ms]) => console.log(`  ${ms.toFixed(1).padStart(7)} ms  ${u}`));
  console.log('TOP SELF');
  top.forEach(([k, ms]) => console.log(`  ${ms.toFixed(1).padStart(7)} ms  ${k}`));
  await ctx.close();
});
