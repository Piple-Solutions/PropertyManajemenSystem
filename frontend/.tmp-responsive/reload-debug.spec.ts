import { test } from '@playwright/test';
import { loginAsAdmin } from '../e2e/helpers';
test('reload debug', async ({ page }) => {
  page.on('response', (r) => { if (r.url().includes('/api/')) console.log('RESP', r.status(), r.url().replace('http://localhost:8787', '')); });
  page.on('requestfailed', (r) => console.log('FAILED', r.url().slice(0,80), r.failure()?.errorText));
  page.on('request', (r) => { if (r.url().includes('/api/')) console.log('REQ', r.method(), r.url().replace('http://localhost:8787','')); });
  page.on('requestfinished', (r) => { if (r.url().includes('/api/')) console.log('FIN', Date.now() % 100000, r.url().replace('http://localhost:8787','')); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 160)); });
  await loginAsAdmin(page);
  console.log('after login url', page.url(), 'token?', await page.evaluate(() => !!localStorage.getItem('pms_token')));
  await page.goto('/dashboard');
  console.log('after goto', page.url());
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(12000);
  console.log('after reload url', page.url(), 'token?', await page.evaluate(() => !!localStorage.getItem('pms_token')));
});
