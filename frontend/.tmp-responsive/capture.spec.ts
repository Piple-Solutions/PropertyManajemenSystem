/**
 * Phase 1 baseline capture (READ-ONLY).
 * Logs in with the existing e2e helper mechanism, then captures full-page
 * screenshots + layout metrics at 6 viewports for the key pages.
 * No form is ever submitted; no mutation is triggered.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';

const OUT = path.resolve(
  process.cwd(),
  '.tmp-responsive',
  process.env.CAPTURE_OUT || 'baseline',
);

interface Viewport {
  name: string;
  width: number;
  height: number;
}

const VIEWPORTS: Viewport[] = [
  { name: '375x812', width: 375, height: 812 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

function sel(el: Element): string {
  const t = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id;
  if (id) return `${t}#${id}`;
  const cls = ((el as HTMLElement).className as unknown) as string;
  const c = typeof cls === 'string' ? cls.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return c ? `${t}.${c}` : t;
}

async function collectMetrics(page: import('@playwright/test').Page, viewport: Viewport) {
  return page.evaluate(
    ({ vw }: { vw: number }) => {
      const q = (s: string) => Array.from(document.querySelectorAll(s));
      const describe = (el: Element) => {
        const t = el.tagName.toLowerCase();
        const id = (el as HTMLElement).id;
        if (id) return `${t}#${id}`;
        const cls = (el as HTMLElement).className;
        const c = typeof cls === 'string' ? cls.trim().split(/\s+/).slice(0, 2).join('.') : '';
        return c ? `${t}.${c}` : t;
      };
      const htmlFont = getComputedStyle(document.documentElement).fontSize;
      const bodyFont = getComputedStyle(document.body).fontSize;
      const de = document.documentElement;
      const pageOverflow = de.scrollWidth > de.clientWidth + 1;

      const side = document.querySelector('.pms-side') as HTMLElement | null;
      let sidebar: Record<string, unknown> = { present: false };
      if (side) {
        const cs = getComputedStyle(side);
        const r = side.getBoundingClientRect();
        sidebar = {
          present: true,
          position: cs.position,
          widthPx: Math.round(r.width),
          shareOfViewport: +(r.width / vw).toFixed(3),
          visible: r.width > 1 && r.height > 1,
        };
      }

      const wide: Array<{ selector: string; widthPx: number }> = [];
      for (const el of q('body *')) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > vw + 1 && wide.length < 200) {
          wide.push({ selector: describe(el), widthPx: Math.round(r.width) });
        }
      }
      wide.sort((a, b) => b.widthPx - a.widthPx);

      let smallTargets = 0;
      const smallTargetSamples: string[] = [];
      for (const el of q('button, a, input, select, textarea, [role=button]')) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < 44 || r.height < 44) {
          smallTargets++;
          if (smallTargetSamples.length < 8) {
            smallTargetSamples.push(
              `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let smallText = 0;
      const bySel = new Map<string, number>();
      let node: Node | null = walker.nextNode();
      let guard = 0;
      while (node && guard < 20000) {
        guard++;
        const text = (node.textContent || '').trim();
        if (text.length > 0) {
          const parent = node.parentElement;
          if (parent) {
            const fs = parseFloat(getComputedStyle(parent).fontSize || '0');
            if (fs > 0 && fs < 12) {
              smallText++;
              const k = describe(parent);
              bySel.set(k, (bySel.get(k) || 0) + 1);
            }
          }
        }
        node = walker.nextNode();
      }
      const topSmallText = Array.from(bySel.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k} x${v}`);

      const inputFonts: string[] = [];
      for (const el of q('input, select, textarea')) {
        inputFonts.push(getComputedStyle(el as Element).fontSize);
      }
      const inputMin = inputFonts.length
        ? Math.min(...inputFonts.map((f) => parseFloat(f) || 999))
        : null;

      return {
        htmlFont,
        bodyFont,
        pageOverflow,
        docScrollWidth: de.scrollWidth,
        docClientWidth: de.clientWidth,
        sidebar,
        wideElements: wide.slice(0, 10),
        wideElementsTotal: wide.length,
        smallTargets,
        smallTargetSamples,
        smallTextNodes: smallText,
        topSmallText,
        inputFonts: inputFonts.slice(0, 12),
        inputFontsMin: inputMin,
        inputBelow16: inputMin !== null && inputMin < 16,
      };
    },
    { vw: viewport.width },
  );
}

test.describe('Phase 1 baseline capture', () => {
  test('capture all pages x viewports (read-only)', async ({ page }) => {
    test.setTimeout(25 * 60 * 1000);
    fs.mkdirSync(OUT, { recursive: true });

    await loginAsAdmin(page);

    // Resolve one reservation id + one invoice id via read-only GETs.
    const ids = await page.evaluate(async () => {
      const token = localStorage.getItem('pms_token');
      const out: { reservationId: string | null; invoiceId: string | null } = {
        reservationId: null,
        invoiceId: null,
      };
      try {
        const r = await fetch('http://localhost:8787/api/reservations?page=1&pageSize=5', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json();
        const list = Array.isArray(j?.data) ? j.data : j?.data?.items;
        if (Array.isArray(list) && list[0]?.id) out.reservationId = String(list[0].id);
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch('http://localhost:8787/api/invoices?page=1&pageSize=5', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json();
        const list = Array.isArray(j?.data) ? j.data : j?.data?.items;
        if (Array.isArray(list) && list[0]?.id) out.invoiceId = String(list[0].id);
      } catch {
        /* ignore */
      }
      return out;
    });

    const pages: Array<{ name: string; url: string }> = [
      { name: 'contact-public', url: '/contact' },
      { name: 'dashboard', url: '/dashboard' },
      { name: 'reservation-list', url: '/dashboard/reservations' },
      { name: 'reservation-calendar', url: '/dashboard/reservations/calendar' },
      { name: 'reservation-wizard-new', url: '/dashboard/reservations/new' },
      ...(ids.reservationId
        ? [{ name: 'reservation-detail', url: `/dashboard/reservations/${ids.reservationId}` }]
        : []),
      { name: 'room-list', url: '/dashboard/rooms' },
      { name: 'room-type-list', url: '/dashboard/room-types' },
      { name: 'invoice-list', url: '/dashboard/finance/invoices' },
      ...(ids.invoiceId
        ? [{ name: 'invoice-detail', url: `/dashboard/finance/invoices/${ids.invoiceId}` }]
        : []),
      { name: 'user-list', url: '/dashboard/users' },
      { name: 'role-list', url: '/dashboard/roles' },
      { name: 'permission-list', url: '/dashboard/permissions' },
      { name: 'finance-sales', url: '/dashboard/finance/sales' },
      { name: 'finance-reports', url: '/dashboard/finance/reports' },
      { name: 'finance-expenses', url: '/dashboard/finance/expenses' },
      { name: 'activity-log', url: '/dashboard/activity' },
      { name: 'change-password', url: '/change-password' },
    ];

    const metrics: Array<Record<string, unknown>> = [];
    const skipped: string[] = [];

    for (const vp of VIEWPORTS) {
      const dir = path.join(OUT, vp.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const p of pages) {
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        const shot = path.join(dir, `${p.name}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const m = await collectMetrics(page, vp);
        metrics.push({ viewport: vp.name, page: p.name, url: p.url, ...m });
      }
    }

    // Wizard step reachability (read-only: validation blocks empty submit,
    // per SCN-04-04; never click a final submit/create button).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard/reservations/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const wizardNotes: Record<string, unknown> = {};
    const nextBtn = page.getByRole('button', { name: /save & continue|continue|next/i }).first();
    wizardNotes.nextVisible = (await nextBtn.count()) > 0;
    if (await nextBtn.count()) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
      wizardNotes.afterNextUrl = page.url();
      wizardNotes.afterNextBody = ((await page.locator('body').innerText()).length > 0)
        ? 'rendered'
        : 'empty';
      await page.screenshot({
        path: path.join(OUT, '375x812', 'reservation-wizard-after-next.png'),
        fullPage: true,
      });
    }
    skipped.push(`wizard step advance attempted at 375px: ${JSON.stringify(wizardNotes)}`);
    if (!ids.reservationId) skipped.push('reservation-detail skipped: no reservation id found');
    if (!ids.invoiceId) skipped.push('invoice-detail skipped: no invoice id found');

    // Drawer interaction checks (mobile only, read-only navigation).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const drawerNotes: Record<string, unknown> = {};
    const hamburger = page.getByRole('button', { name: /open navigation menu/i });
    drawerNotes.hamburgerVisible = await hamburger.isVisible();
    drawerNotes.hamburgerExpandedBefore = await hamburger.getAttribute('aria-expanded');
    const topbarH = await page.evaluate(() => {
      const el = document.querySelector('.pms-topbar');
      return el ? Math.round(el.getBoundingClientRect().height) : null;
    });
    drawerNotes.topbarHeight = topbarH;
    const mainMargin = await page.evaluate(() => {
      const el = document.querySelector('.pms-main');
      return el ? getComputedStyle(el as Element).marginLeft : null;
    });
    drawerNotes.mainMarginLeft = mainMargin;
    await hamburger.click();
    await page.waitForTimeout(600);
    drawerNotes.hamburgerExpandedAfter = await hamburger.getAttribute('aria-expanded');
    drawerNotes.backdropVisible = await page
      .getByRole('button', { name: /close navigation menu/i })
      .first()
      .isVisible();
    drawerNotes.focusInsideDrawer = await page.evaluate(() => {
      const ae = document.activeElement;
      const drawer = document.getElementById('pms-drawer');
      return !!ae && !!drawer && drawer.contains(ae);
    });
    await page.screenshot({
      path: path.join(OUT, '375x812', 'drawer-open.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    drawerNotes.closedByEscape = (await hamburger.getAttribute('aria-expanded')) === 'false';
    await hamburger.click();
    await page.waitForTimeout(600);
    // Click the visible backdrop area to the right of the 240px drawer.
    await page.mouse.click(350, 500);
    await page.waitForTimeout(400);
    drawerNotes.closedByBackdrop = (await hamburger.getAttribute('aria-expanded')) === 'false';
    // Route change closes the drawer.
    await hamburger.click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: /^dashboard$/i }).first().click();
    await page.waitForTimeout(800);
    drawerNotes.closedByRouteChange =
      (await hamburger.getAttribute('aria-expanded')) === 'false';
    drawerNotes.noPageOverflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    skipped.push(`drawer checks at 375px: ${JSON.stringify(drawerNotes)}`);

    fs.writeFileSync(
      path.join(OUT, 'metrics.json'),
      JSON.stringify({ viewports: VIEWPORTS, pages, skipped, metrics }, null, 2),
    );
  });
});
