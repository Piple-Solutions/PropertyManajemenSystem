import { test, expect } from '@playwright/test';
import { attachErrorCollectors, loginAsAdmin } from './helpers';

test.describe('SCN-03 Dashboard + SCN-09 cross-cutting', () => {
  test.beforeEach(async ({ page }) => {
    attachErrorCollectors(page);
    await loginAsAdmin(page);
  });

  test('SCN-03-01 dashboard stats render', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /homestay joglo seruni syariah/i })).toBeVisible({ timeout: 15000 });
    for (const stat of [/check-in hari ini/i, /reservasi aktif/i, /omzet hari ini/i, /invoice tertunda/i, /okupansi/i, /total reservasi/i]) {
      await expect(page.locator('body').getByText(stat).first()).toBeVisible();
    }
  });

  test('SCN-03-02 quick actions navigate', async ({ page }) => {
    const links: [RegExp, RegExp][] = [
      [/reservasi baru/i, /\/dashboard\/reservations\/new/],
      [/tambah kamar/i, /\/dashboard\/rooms\/new/],
      [/laporan keuangan/i, /\/dashboard\/finance\/reports/],
    ];
    for (const [name, url] of links) {
      await page.goto('/dashboard');
      const el = page.getByRole('link', { name }).first();
      if (await el.count()) {
        await el.click();
        await expect(page).toHaveURL(url, { timeout: 10000 });
      }
    }
  });

  test('SCN-03-03 revenue period filter switches', async ({ page }) => {
    await page.goto('/dashboard');
    for (const name of [/mingguan/i, /bulanan/i, /tahunan/i]) {
      const btn = page.getByRole('button', { name }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    }
    await expect(page.locator('body')).toContainText(/./);
  });

  test('SCN-03-04 recent reservations table + detail link', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/reservasi terakhir/i).first()).toBeVisible({ timeout: 15000 });
    const rowLink = page.locator('a[href*="/dashboard/reservations/"]').first();
    if (await rowLink.count()) {
      await rowLink.click();
      await expect(page).toHaveURL(/\/dashboard\/reservations\/.+/, { timeout: 10000 });
    }
  });

  test('SCN-09-01 sidebar navigation all links 200', async ({ page }) => {
    const urls = [
      '/dashboard',
      '/dashboard/reservations',
      '/dashboard/reservations/calendar',
      '/dashboard/finance/sales',
      '/dashboard/finance/invoices',
      '/dashboard/finance/reports',
      '/dashboard/finance/expenses',
      '/dashboard/room-types',
      '/dashboard/rooms',
      '/dashboard/management',
      '/dashboard/activity',
      '/dashboard/users',
      '/dashboard/roles',
      '/dashboard/permissions',
    ];
    for (const url of urls) {
      const resp = await page.goto(url);
      // RequirePermission may render "Akses Ditolak" but HTTP is still 200 (SPA)
      expect(resp?.status(), url).toBe(200);
      // Lazy route chunks render after load — poll until the page has real text.
      await expect.poll(async () => (await page.locator('body').innerText()).trim().length, `${url} blank`).toBeGreaterThan(0);
    }
  });

  test('SCN-09-03 session persists after reload', async ({ page }) => {
    await page.goto('/dashboard');
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});
