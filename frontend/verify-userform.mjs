import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const OUT = 'C:\\Users\\apang\\AppData\\Local\\Temp\\opencode';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)); });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder('john@hotel.com').fill('admin@hotel.com');
await page.getByPlaceholder('Enter your password').fill('admin123');
await page.getByRole('button', { name: /^login$/i }).click();
await page.waitForURL(/\/dashboard/, { timeout: 20000 });
await page.waitForTimeout(1500);

// Go to user detail (Another Staff) and open Edit
await page.goto(`${BASE}/dashboard/users/user-005`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/uf-detail.png` });
const editBtn = page.getByRole('button', { name: 'Edit user' });
console.log('edit button count:', await editBtn.count());
if (await editBtn.count()) {
  await editBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/uf-editmodal.png` });
  const body = await page.locator('body').innerText();
  console.log('HAS Permissions section:', /User-specific access to existing pages/.test(body));
  console.log('HAS reservation.view checkbox:', (await page.getByLabel('Reservasi permission').count()) > 0);
}

// Also check the Assign Role modal in the list (what user may have opened)
await page.goto(`${BASE}/dashboard/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const assignBtns = page.getByRole('button', { name: /assign role/i });
console.log('assign-role buttons:', await assignBtns.count());
if (await assignBtns.count()) {
  await assignBtns.first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/uf-assignmodal.png` });
  const t = await page.locator('body').innerText();
  console.log('assign modal HAS Permissions section:', /User-specific access to existing pages/.test(t));
}

await browser.close();
console.log('done');
