/** Drawer behaviour probe @375 (read-only navigation). Writes drawer-check.json under CAPTURE_OUT. */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', process.env.CAPTURE_OUT || 'after-step');

test('drawer check', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/rooms', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const r: Record<string, unknown> = {};
  const ham = page.getByRole('button', { name: /open navigation menu/i });
  const state = () =>
    page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      const drawer = document.getElementById('pms-drawer');
      const main = document.querySelector('.pms-main') as (HTMLElement & { inert?: boolean }) | null;
      return {
        expanded: document.querySelector('.pms-topbar__menu')?.getAttribute('aria-expanded'),
        bodyOverflow: document.body.style.overflow || 'unset',
        focusInDrawer: !!(ae && drawer && drawer.contains(ae)),
        focusOnHamburger: !!ae && ae.classList.contains('pms-topbar__menu'),
        drawerVisibility: drawer ? getComputedStyle(drawer).visibility : null,
        mainInert: main ? !!main.inert : null,
        url: location.pathname,
      };
    });
  const tabInto = async (selector: string, n: number) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('Tab');
      const hit = await page.evaluate(
        (sel) => !!document.activeElement && !!document.activeElement.closest(sel),
        selector,
      );
      if (hit) return true;
    }
    return false;
  };

  r.initial = await state();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  r.closedDrawerTabReachable = await tabInto('#pms-drawer', 25);

  await ham.click();
  await page.waitForTimeout(450);
  r.open = await state();
  // While open, Tab must never reach the page behind (main/topbar).
  r.openTabEscapesToMain = await tabInto('.pms-main, .pms-topbar, .pms-footer', 25);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  r.afterEscape = await state();

  await ham.click();
  await page.waitForTimeout(450);
  await page.mouse.click(350, 500);
  await page.waitForTimeout(450);
  r.afterBackdrop = await state();

  // Tap a collapsed group: expands, drawer stays open, URL unchanged.
  await ham.click();
  await page.waitForTimeout(450);
  const group = page.locator('#pms-drawer').getByRole('button', { name: /^reservasi$/i });
  await group.click();
  await page.waitForTimeout(500);
  r.afterGroupExpand = await state();
  r.subLinksVisible = await page
    .locator('#pms-drawer')
    .getByRole('link', { name: /kalender/i })
    .isVisible();

  // Child link (different route): drawer closes, focus returns.
  await page.locator('#pms-drawer').getByRole('link', { name: /kalender/i }).click();
  await page.waitForTimeout(900);
  r.afterChildRoute = await state();

  // Same-route link tap now closes the drawer.
  await ham.click();
  await page.waitForTimeout(450);
  await page.locator('#pms-drawer').getByRole('link', { name: /kalender/i }).click();
  await page.waitForTimeout(600);
  r.afterSameRouteTap = await state();

  // Outlet survives crossing the 767/768 boundary.
  await page.evaluate(() => {
    (document.querySelector('.pms-main') as unknown as { __p?: string }).__p = 'same';
  });
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(700);
  r.outletSurvivesLandscape = await page.evaluate(
    () => (document.querySelector('.pms-main') as unknown as { __p?: string } | null)?.__p === 'same',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  r.outletSurvivesBack = await page.evaluate(
    () => (document.querySelector('.pms-main') as unknown as { __p?: string } | null)?.__p === 'same',
  );

  // Scroll lock restored when resizing to desktop while open.
  await page.getByRole('button', { name: /open navigation menu/i }).click();
  await page.waitForTimeout(450);
  r.lockedWhileOpen = (await state()).bodyOverflow;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  r.afterResizeDesktop = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow || 'unset',
    topbarPresent: !!document.querySelector('.pms-topbar'),
    mainInert: !!(document.querySelector('.pms-main') as HTMLElement & { inert?: boolean }).inert,
    sidebarWidth: Math.round(document.querySelector('.pms-side')!.getBoundingClientRect().width),
  }));

  fs.writeFileSync(path.join(OUT, 'drawer-check.json'), JSON.stringify(r, null, 2));
});
