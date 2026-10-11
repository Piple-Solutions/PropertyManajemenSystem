import { test, expect } from '@playwright/test';
import { attachErrorCollectors, loginAsAdmin } from './helpers';
import { getInvoiceSettlement, isInvoiceFullyPaid, toRupiah } from '../src/utils/invoicePayment';
import type { Invoice } from '../src/types/auth.types';

/**
 * LUNAS watermark — invoice print preview only.
 *
 * The print document lives in `.invoice-print-area`, which is `display: none`
 * on screen and `display: block` under `@media print`. Every visual test
 * therefore emulates print media, which is what the browser's
 * "Print → Save as PDF" pipeline uses.
 */

/** Minimal invoice fixture; only the fields the helper reads matter. */
function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv-test',
    invoiceNumber: 'INV-TEST-001',
    guestName: 'Test Guest',
    source: 'direct',
    invoiceDate: '2026-09-15',
    items: [],
    subtotal: 2_500_000,
    discount: 0,
    total: 2_500_000,
    paymentStatus: 'Pending',
    invoiceStatus: 'Sent',
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
    ...overrides,
  };
}

/** Rotation in degrees from a computed `matrix(a, b, c, d, e, f)`. */
function rotationDeg(transform: string): number {
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const [a, b] = m[1].split(',').map((n) => parseFloat(n));
  return (Math.atan2(b, a) * 180) / Math.PI;
}

test.describe('SCN-10 LUNAS watermark — payment state logic (unchanged)', () => {
  test('UNPAID: nothing settled, no watermark', () => {
    const s = getInvoiceSettlement(invoice({ totalPaid: 0, paymentStatus: 'Pending' }));
    expect(s.remaining).toBe(2_500_000);
    expect(s.isFullyPaid).toBe(false);
  });

  test('PARTIAL / DP: still outstanding, no watermark', () => {
    const s = getInvoiceSettlement(invoice({ totalPaid: 1_000_000, paymentStatus: 'Partial' }));
    expect(s.remaining).toBe(1_500_000);
    expect(s.isFullyPaid).toBe(false);
  });

  test('FULLY PAID: remaining 0, watermark', () => {
    const s = getInvoiceSettlement(invoice({ totalPaid: 2_500_000, paymentStatus: 'Paid' }));
    expect(s.remaining).toBe(0);
    expect(s.isFullyPaid).toBe(true);
  });

  test('EXACTLY equal to total still counts as settled', () => {
    expect(isInvoiceFullyPaid(invoice({ totalPaid: 2_500_000, paymentStatus: 'Paid' }))).toBe(true);
  });

  test('ONE RUPIAH short is NOT settled', () => {
    const s = getInvoiceSettlement(invoice({ totalPaid: 2_499_999, paymentStatus: 'Paid' }));
    expect(s.remaining).toBe(1);
    expect(s.isFullyPaid).toBe(false);
  });

  test('overpayment settles the invoice (no overpayment workflow invented)', () => {
    const s = getInvoiceSettlement(invoice({ totalPaid: 2_600_000, paymentStatus: 'Paid' }));
    expect(s.remaining).toBe(-100_000);
    expect(s.isFullyPaid).toBe(true);
  });

  test('CANCELLED invoice never presents as paid, even with payment data', () => {
    const s = getInvoiceSettlement(
      invoice({ totalPaid: 2_500_000, paymentStatus: 'Paid', invoiceStatus: 'Cancelled' }),
    );
    expect(s.remaining).toBe(0);
    expect(s.isFullyPaid).toBe(false);
  });

  test('a payment record alone does not settle: status Paid but amount short', () => {
    expect(isInvoiceFullyPaid(invoice({ totalPaid: 500_000, paymentStatus: 'Paid' }))).toBe(false);
  });

  test('falls back to paymentStatus when no amounts are tracked', () => {
    expect(isInvoiceFullyPaid(invoice({ paymentStatus: 'Paid' }))).toBe(true);
    expect(isInvoiceFullyPaid(invoice({ paymentStatus: 'Partial' }))).toBe(false);
    expect(isInvoiceFullyPaid(invoice({ paymentStatus: 'Overdue' }))).toBe(false);
    expect(isInvoiceFullyPaid(invoice({ paymentStatus: 'Pending' }))).toBe(false);
  });

  test('float noise cannot hide a settled invoice', () => {
    const s = getInvoiceSettlement(invoice({ total: 100.4, totalPaid: 100.4, paymentStatus: 'Paid' }));
    expect(toRupiah(s.paid)).toBe(100);
    expect(s.isFullyPaid).toBe(true);
  });
});

test.describe('SCN-10 LUNAS watermark — print preview rendering', () => {
  test.beforeEach(async ({ page }) => {
    attachErrorCollectors(page);
    await loginAsAdmin(page);
  });

  test('print preview of a PAID invoice shows the watermark', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const wm = page.getByTestId('lunas-watermark');
    await expect(wm).toBeVisible({ timeout: 10000 });
    await expect(wm).toHaveText('LUNAS');
  });

  test('print preview of an UNPAID invoice has no watermark', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-003');
    await expect(page.getByRole('heading', { name: 'INV-2026-003' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('lunas-watermark')).toHaveCount(0);
  });

  test('exactly ONE LUNAS visual — the old stamp is not rendered alongside', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    // Single element, and no leftover rubber-stamp markup.
    await expect(page.locator('.invoice-watermark')).toHaveCount(1);
    await expect(page.locator('.lunas-stamp')).toHaveCount(0);
    await expect(page.locator('.lunas-stamp__text')).toHaveCount(0);
    await expect(page.locator('.invoice-print')).toHaveCount(1);
  });

  test('watermark is a bordered rectangle, not a rubber stamp', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const cs = await page.getByTestId('lunas-watermark').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borderWidth: parseFloat(s.borderTopWidth),
        borderStyle: s.borderTopStyle,
        borderColor: s.borderTopColor,
        color: s.color,
        fontSize: parseFloat(s.fontSize),
        radius: parseFloat(s.borderTopLeftRadius),
        shadow: s.boxShadow,
        background: s.backgroundColor,
        backgroundImage: s.backgroundImage,
      };
    });
    // A thin rectangular frame exists on all four sides.
    expect(cs.borderStyle).toBe('solid');
    expect(cs.borderWidth).toBeGreaterThan(0);
    // Frame weight is tied to the word it encloses (expressed in `em`), so it
    // scales with the type rather than being a fixed pixel rule.
    const em = cs.borderWidth / cs.fontSize;
    expect(em).toBeGreaterThanOrEqual(0.05);
    expect(em).toBeLessThanOrEqual(0.12);
    // Frame and text share one ink colour -> one visual treatment.
    expect(cs.borderColor).toBe(cs.color);
    // Rectangular, not circular: minimally rounded, never a half-round pill.
    expect(cs.radius).toBeLessThanOrEqual(4);
    expect(cs.radius).toBeLessThan(cs.borderWidth * 4);
    // Transparent so invoice content reads through it; no fill, no shadow.
    expect(cs.background).toBe('rgba(0, 0, 0, 0)');
    expect(cs.backgroundImage).toBe('none');
    expect(cs.shadow).toBe('none');
  });

  test('border and LUNAS text rotate together as one object', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const wm = page.getByTestId('lunas-watermark');
    // One element carries both the frame and the word, so a single transform
    // necessarily rotates them together.
    const info = await wm.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        children: el.childElementCount,
        hasBorder: parseFloat(cs.borderTopWidth) > 0,
        transform: cs.transform,
        tag: el.tagName,
      };
    });
    expect(info.tag).toBe('DIV');
    expect(info.children).toBe(0); // no nested element could rotate separately
    expect(info.hasBorder).toBe(true);
    const deg = rotationDeg(info.transform);
    expect(deg).toBeLessThanOrEqual(-8);
    expect(deg).toBeGreaterThanOrEqual(-12);
    // Frame is materially wider than tall -> a landscape frame, not a square.
    const box = (await wm.boundingBox())!;
    expect(box.width).toBeGreaterThan(box.height * 1.4);
  });

  test('watermark sits ON TOP of the invoice content', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-007');
    await expect(page.getByRole('heading', { name: 'INV-2026-007' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const layering = await page.evaluate(() => {
      const wm = document.querySelector('.invoice-watermark') as HTMLElement;
      const sibling = document.querySelector('.invoice-print__totals') as HTMLElement;
      const ws = getComputedStyle(wm);
      const ss = getComputedStyle(sibling);
      return {
        wmPosition: ws.position,
        wmZ: Number(ws.zIndex),
        siblingPosition: ss.position,
        siblingZ: Number(ss.zIndex),
      };
    });
    // Watermark on the top layer, above every invoice field, text and table.
    expect(layering.wmPosition).toBe('absolute');
    expect(layering.wmZ).toBeGreaterThan(layering.siblingZ);
    expect(layering.siblingPosition).toBe('relative');
  });

  test('watermark is large, subtle, and slightly rotated', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-002');
    await expect(page.getByRole('heading', { name: 'INV-2026-002' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const cs = await page.getByTestId('lunas-watermark').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontSize: parseFloat(s.fontSize),
        fontWeight: Number(s.fontWeight),
        opacity: parseFloat(s.opacity),
        transform: s.transform,
        letterSpacing: parseFloat(s.letterSpacing),
        color: s.color,
        adjust: s.printColorAdjust || s.webkitPrintColorAdjust,
        pointerEvents: s.pointerEvents,
        whiteSpace: s.whiteSpace,
      };
    });
    const baseFont = await page
      .locator('.invoice-print__muted')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    // Substantially larger than surrounding invoice text.
    expect(cs.fontSize).toBeGreaterThan(baseFont * 3);
    // Medium/semibold, not an extremely bold face: hierarchy from size+tracking.
    expect(cs.fontWeight).toBeGreaterThanOrEqual(500);
    expect(cs.fontWeight).toBeLessThanOrEqual(600);
    // Moderate tracking — legible as tracked-out but not exaggerated.
    expect(cs.letterSpacing).toBeGreaterThan(cs.fontSize * 0.1);
    expect(cs.letterSpacing).toBeLessThan(cs.fontSize * 0.25);
    // Semi-transparent, yet still present when printed.
    expect(cs.opacity).toBeGreaterThan(0);
    expect(cs.opacity).toBeLessThanOrEqual(0.2);
    // Subtle rotation inside the requested -8deg..-12deg range.
    const deg = rotationDeg(cs.transform);
    expect(deg).toBeLessThanOrEqual(-8);
    expect(deg).toBeGreaterThanOrEqual(-12);
    // Must not wrap onto a second line.
    expect(cs.whiteSpace).toBe('nowrap');
    // Muted earth-tone ink, not a bright red.
    expect(cs.color).toBe('rgb(140, 58, 51)');
    expect(cs.adjust).toBe('exact');
    // Decorative: never a hit target.
    expect(cs.pointerEvents).toBe('none');
  });

  test('watermark adds no flow height, so it cannot create an extra page', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-007');
    await expect(page.getByRole('heading', { name: 'INV-2026-007' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const res = await page.evaluate(() => {
      const wm = document.querySelector('.invoice-watermark') as HTMLElement;
      const doc = document.querySelector('.invoice-print') as HTMLElement;
      const position = getComputedStyle(wm).position;
      // Measure the LIVE document, then remove the watermark and re-measure:
      // a detached clone would report a meaningless scrollHeight.
      const withH = doc.scrollHeight;
      const parent = wm.parentElement as HTMLElement;
      wm.remove();
      const withoutH = doc.scrollHeight;
      parent.insertBefore(wm, parent.firstChild); // restore
      return { position, withH, withoutH };
    });
    // Absolutely positioned => contributes nothing to document height.
    expect(res.position).toBe('absolute');
    expect(res.withH).toBe(res.withoutH);
  });

  test('important invoice information stays readable over the watermark', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-007'); // longest items table
    await expect(page.getByRole('heading', { name: 'INV-2026-007' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    // Every critical field still renders real text (not obscured or replaced).
    const doc = page.locator('.invoice-print');
    await expect(doc).toContainText('INV-2026-007');
    await expect(doc).toContainText('Maria Garcia');
    await expect(doc).toContainText('Room 101');
    await expect(doc).toContainText('Room 102');
    await expect(doc).toContainText('Rp 3.780.000');
    await expect(doc).toContainText('Total Paid');
    await expect(doc).toContainText('Remaining');
    await expect(doc).toContainText('Rp 0');
  });

  test('settlement is stated in text, so the watermark is not the only signal', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const doc = page.locator('.invoice-print');
    await expect(doc).toContainText('Payment Status');
    await expect(doc).toContainText('Paid');
    await expect(doc).toContainText('Remaining');
    await expect(doc).toContainText('Rp 0');
  });

  test('watermark is not visible on screen (print-only)', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('lunas-watermark')).toHaveCount(1);
    await expect(page.getByTestId('lunas-watermark')).toBeHidden();
    await expect(page.locator('.invoice-print-area')).toBeHidden();
  });

  test('watermark stays inside the page and is not selectable or interactive', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const wm = page.getByTestId('lunas-watermark');
    await expect(wm).toBeVisible({ timeout: 10000 });

    const sb = (await wm.boundingBox())!;
    const pb = (await page.locator('.invoice-print').boundingBox())!;
    // Rotation inflates the box slightly; allow a small overhang margin.
    expect(sb.x).toBeGreaterThanOrEqual(pb.x - 20);
    expect(sb.x + sb.width).toBeLessThanOrEqual(pb.x + pb.width + 20);
    expect(sb.y).toBeGreaterThanOrEqual(pb.y - 20);
    expect(sb.y + sb.height).toBeLessThanOrEqual(pb.y + pb.height + 20);

    // Purely decorative: aria-hidden, unselectable, no animation.
    const attrs = await wm.evaluate((el) => ({
      ariaHidden: el.getAttribute('aria-hidden'),
      userSelect: getComputedStyle(el).userSelect,
      animation: getComputedStyle(el).animationName,
      transition: getComputedStyle(el).transitionDuration,
      tag: el.tagName,
    }));
    expect(attrs.ariaHidden).toBe('true');
    expect(attrs.userSelect).toBe('none');
    expect(attrs.animation).toBe('none');
    expect(attrs.transition).toBe('0s');
    expect(attrs.tag).toBe('DIV'); // not a button / link / input
  });

  test('watermark stays inside the document at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/dashboard/finance/invoices/inv-001');
    await expect(page.getByRole('heading', { name: 'INV-2026-001' })).toBeVisible({ timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const wm = page.getByTestId('lunas-watermark');
    await expect(wm).toBeVisible({ timeout: 10000 });
    const sb = (await wm.boundingBox())!;
    const pb = (await page.locator('.invoice-print').boundingBox())!;
    expect(sb.x).toBeGreaterThanOrEqual(pb.x - 20);
    expect(sb.x + sb.width).toBeLessThanOrEqual(pb.x + pb.width + 20);
  });
});