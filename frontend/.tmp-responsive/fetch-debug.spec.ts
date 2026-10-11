import { test } from '@playwright/test';
test('fetch debug', async ({ page }) => {
  await page.goto('/login');
  const r = await page.evaluate(async () => {
    const out: string[] = [];
    const t0 = performance.now();
    try {
      const l = await fetch('http://localhost:8787/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hotel.com', password: 'admin123' }) });
      const j = await l.json();
      out.push(`login ${l.status} ${Math.round(performance.now() - t0)}ms`);
      const token = j.data.token;
      for (let i = 0; i < 3; i++) {
        const t1 = performance.now();
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 8000);
        try {
          const m = await fetch('http://localhost:8787/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
          out.push(`me ${m.status} ${Math.round(performance.now() - t1)}ms acao=${m.headers.get('access-control-allow-origin')}`);
        } catch (e) { out.push(`me ERR ${(e as Error).name} ${Math.round(performance.now() - t1)}ms`); }
        clearTimeout(to);
      }
    } catch (e) { out.push('ERR ' + (e as Error).message); }
    return out;
  });
  console.log(r.join('\n'));
});
