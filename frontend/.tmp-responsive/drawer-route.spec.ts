import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../e2e/helpers';

test.describe('drawer route-change check', () => {
  test('drawer closes on navigation to a different route', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await page.goto('/dashboard/rooms', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const hamburger = page.getByRole('button', { name: /open navigation menu/i });
    await hamburger.click();
    await page.waitForTimeout(500);
    expect(await hamburger.getAttribute('aria-expanded')).toBe('true');
    await page.getByRole('link', { name: /^dashboard$/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10000 });
    await page.waitForTimeout(500);
    expect(await hamburger.getAttribute('aria-expanded')).toBe('false');
  });

  test('drawer has no transition under prefers-reduced-motion', async ({ browser }) => {
    // Fresh reduced-motion context on the same browser.
    const ctx = await browser.newContext({
      baseURL: 'http://localhost:5173',
      viewport: { width: 375, height: 812 },
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await loginAsAdmin(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const transition = await page.evaluate(() => {
      const el = document.getElementById('pms-drawer');
      return el ? getComputedStyle(el).transitionDuration : null;
    });
    // Global reduced-motion guard forces 0.01ms (!important); drawer adds
    // `transition: none`. Either way effective motion is ~zero.
    expect(parseFloat(transition || '1')).toBeLessThan(0.001);
    await ctx.close();
  });
});
