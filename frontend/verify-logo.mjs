import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const OUT = 'C:\\Users\\apang\\AppData\\Local\\Temp\\opencode';

const FAKE_USER = {
  data: {
    user: {
      id: 'u1', name: 'Admin User', email: 'admin@hotel.com', roles: ['admin'],
      status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    permissions: [
      'reservation.view', 'finance.sales.view', 'finance.invoice.view', 'finance.report.view',
      'room.view', 'user.view', 'role.view', 'permission.view', 'activity.view',
    ],
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const failed = [];
page.on('response', (res) => {
  if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
});
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.route('**/api/**', (r) =>
  r.fulfill({ contentType: 'application/json', status: 404, body: JSON.stringify({ error: 'mocked' }) }),
);
await page.route('**/api/auth/me', (r) =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_USER) }),
);
await page.addInitScript(() => {
  localStorage.setItem('pms_token', 'fake-token-for-layout-check');
});

await page.goto(`${BASE}/dashboard/finance/invoices/inv-007`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'INV-2026-007' }).waitFor({ timeout: 15000 });
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(800);

const logo = await page.evaluate(() => {
  const img = document.querySelector('.invoice-print__logo');
  if (!img) return { found: false };
  return {
    found: true,
    src: img.currentSrc || img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
    alt: img.alt,
    display: getComputedStyle(img).display,
    width: getComputedStyle(img).width,
  };
});
console.log('LOGO:', JSON.stringify(logo, null, 2));
console.log('FAILED REQUESTS:', failed.length ? failed : 'none');

await page.screenshot({ path: `${OUT}/inv-logo-check.png` });

await browser.close();
console.log('done');
