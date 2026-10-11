/**
 * Resume verification (READ-ONLY navigation). Reuses e2e/helpers loginAsAdmin.
 * Captures Dashboard + Reservation calendar at 4 viewports and probes the
 * mobile drawer. No form is submitted, no mutation is triggered.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(process.cwd(), '.tmp-responsive', 'resume-check');
const VPS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

test('resume-check', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const result: Record<string, unknown> = {};
  await loginAsAdmin(page);

  for (const vp of VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, url] of [
      ['dashboard', '/dashboard'],
      ['reservation-calendar', '/dashboard/reservations/calendar?month=2026-10'],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`), fullPage: true });
      result[`${vp.name}/${name}`] = await page.evaluate(() => {
        const de = document.documentElement;
        const main = document.querySelector('.pms-main') as HTMLElement | null;
        const side = document.querySelector('.pms-side') as HTMLElement | null;
        return {
          pageOverflow: de.scrollWidth > de.clientWidth + 1,
          mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
          mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
          sideWidth: side ? Math.round(side.getBoundingClientRect().width) : null,
          sideVisibility: side ? getComputedStyle(side).visibility : null,
          htmlFont: getComputedStyle(de).fontSize,
        };
      });
    }
  }

  // Drawer interaction @375
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/rooms', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const d: Record<string, unknown> = {};
  const ham = page.getByRole('button', { name: /open navigation menu/i });
  const expanded = async () => ham.getAttribute('aria-expanded');
  const state = () =>
    page.evaluate(() => {
      const ae = document.activeElement as HTMLElement | null;
      const drawer = document.getElementById('pms-drawer');
      return {
        bodyOverflow: document.body.style.overflow,
        focusInDrawer: !!(ae && drawer && drawer.contains(ae)),
        focusOnHamburger: !!ae && ae.classList.contains('pms-topbar__menu'),
        drawerVisibility: drawer ? getComputedStyle(drawer).visibility : null,
        drawerLeft: drawer ? Math.round(drawer.getBoundingClientRect().left) : null,
      };
    });
  d.initial = await state();
  // Closed drawer reachable by Tab?
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let tabbedIntoClosedDrawer = false;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const inDrawer = await page.evaluate(() => {
      const ae = document.activeElement;
      const dr = document.getElementById('pms-drawer');
      return !!(ae && dr && dr.contains(ae));
    });
    if (inDrawer) { tabbedIntoClosedDrawer = true; break; }
  }
  d.tabbedIntoClosedDrawer = tabbedIntoClosedDrawer;

  await ham.click(); await page.waitForTimeout(500);
  d.afterOpen = { expanded: await expanded(), ...(await state()) };
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  d.afterEscape = { expanded: await expanded(), ...(await state()) };

  await ham.click(); await page.waitForTimeout(500);
  await page.mouse.click(350, 500); await page.waitForTimeout(500);
  d.afterBackdrop = { expanded: await expanded(), ...(await state()) };

  // Same-route link tap
  await ham.click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^kamar$/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  d.afterTapGroupKamar = { url: page.url(), expanded: await expanded(), ...(await state()) };

  // Different-route link
  if ((await expanded()) !== 'true') { await ham.click(); await page.waitForTimeout(500); }
  await page.getByRole('link', { name: /^dashboard$/i }).first().click();
  await page.waitForTimeout(800);
  d.afterRouteChange = { url: page.url(), expanded: await expanded(), ...(await state()) };

  // Same-route link tap leaves drawer open?
  await ham.click(); await page.waitForTimeout(500);
  await page.getByRole('link', { name: /^dashboard$/i }).first().click();
  await page.waitForTimeout(600);
  d.afterSameRouteLinkTap = { expanded: await expanded(), ...(await state()) };
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // Rotation: state loss across 767/768 boundary (Outlet remount)
  await page.goto('/dashboard/reservations/calendar?month=2026-10', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const marker = await page.evaluate(() => {
    const m = document.querySelector('.pms-main') as HTMLElement;
    (m as unknown as { __probe?: string }).__probe = 'same-node';
    return true;
  });
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(800);
  d.outletNodeSurvivesResize = await page.evaluate(
    () => (document.querySelector('.pms-main') as unknown as { __probe?: string } | null)?.__probe === 'same-node',
  );
  d.markerSet = marker;

  // Resize to desktop while open restores scroll lock
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /open navigation menu/i }).click();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  d.afterResizeToDesktopWhileOpen = { bodyOverflow: await page.evaluate(() => document.body.style.overflow) };

  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n' + JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(OUT, 'drawer.json'), JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(result, null, 2));
});
