import { test, expect, type Page, type Request } from '@playwright/test';
import { attachErrorCollectors, loginAsAdmin } from './helpers';

/**
 * Idempotency for the three create endpoints (backend migration 0007).
 *
 * The create screens are real UI flows (headed, preview build + local backend
 * on 8787 as documented in playwright.config.ts). Every scenario asserts:
 *   1. the POST carries the `Idempotency-Key` header;
 *   2. replaying the captured key + captured body is a 201 replay (header
 *      `Idempotency-Replayed: true`, same entity id);
 *   3. the entity exists exactly once — the retry created no duplicate.
 *
 * Replays are sent from the test process with the browser's token, which is
 * exactly the transport a lost-response retry would use.
 *
 * Selector notes (keep in sync with the shared components):
 *   - `Input`/`Select` forward RHF `register()` props verbatim, so the
 *     `name` attribute is the reliable hook (default text inputs render
 *     WITHOUT a `type` attribute — `input[type="text"]` never matches).
 *   - `Select` always renders a disabled placeholder option first, so
 *     `selectOption({ index: 1 })` picks the first real option.
 *   - The reservation wizard's room picker is native `<button>` tiles
 *     with `aria-pressed` + `Room N, <type>, available` labels — not
 *     checkboxes.
 */
const API_BASE = 'http://localhost:8787';

async function apiToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('pms_token') ?? '');
}

/** Diagnostics: if the page/tab dies mid-test, the reporter shows where. */
function diag(page: Page) {
  page.on('close', () => console.log(`[11-idempotency] page closed; url was ${page.url()}`));
  page.on('crash', () => console.log(`[11-idempotency] page CRASHED; url was ${page.url()}`));
}

/** Arm request/response capture for a future create POST. */
function armCreateCapture(page: Page, urlPart: string) {
  const postPromise = page.waitForRequest(
    (r) => r.url().includes(urlPart) && r.method() === 'POST',
    { timeout: 40000 },
  );
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes(urlPart) && r.request().method() === 'POST',
    { timeout: 40000 },
  );
  return { postPromise, responsePromise };
}

async function consumeCreateCapture(
  postPromise: Promise<Request>,
  responsePromise: Promise<Response>,
): Promise<{ key: string; body: Record<string, unknown>; status: number; data: Record<string, unknown> }> {
  const post: Request = await postPromise;
  const res = await responsePromise;
  const json = (await res.json()) as { data?: unknown };
  return {
    key: post.headers()['idempotency-key'] ?? '',
    body: JSON.parse(post.postData() ?? '{}') as Record<string, unknown>,
    status: res.status(),
    data: json.data as Record<string, unknown>,
  };
}

/** Assert the captured create is a keyed 201 and return the entity id. */
async function assertKeyedCreate(
  captured: Awaited<ReturnType<typeof consumeCreateCapture>>,
): Promise<string> {
  expect(captured.status, 'creation succeeded').toBe(201);
  expect(captured.key, 'Idempotency-Key header is present on create').toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  return captured.data.id as string;
}

/** A same-key same-payload retry must be a 201 replay of the same entity. */
async function expectReplay(
  page: Page,
  url: string,
  key: string,
  body: Record<string, unknown>,
  createdId: string,
): Promise<void> {
  const token = await apiToken(page);
  const replay = await page.request.post(url, {
    data: body,
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
  });
  expect(replay.status(), 'same-key retry replays instead of creating').toBe(201);
  expect(replay.headers()['idempotency-replayed'], 'replay is marked as such').toBe('true');
  expect(((await replay.json()) as { data: { id: string } }).data.id).toBe(createdId);
}

test.describe('Idempotency (create endpoints)', () => {
  test.beforeEach(async ({ page }) => {
    diag(page);
    attachErrorCollectors(page);
    await loginAsAdmin(page);
  });

  test('expense: create is keyed, same-key retry replays with no duplicate', async ({ page }) => {
    await page.goto('/dashboard/finance/expenses');
    await expect(page.getByRole('heading', { name: /expenses/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /new expense/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const stamp = Date.now().toString(36);
    const description = `Idem E2E expense ${stamp}`;
    const capture = armCreateCapture(page, '/api/expenses');

    await modal.locator('select[name="category"]').selectOption({ index: 1 });
    await modal.locator('input[name="date"]').fill('2026-10-01');
    await modal.locator('input[name="description"]').fill(description);
    await modal.locator('input[name="amount"]').fill('75000');
    await modal.getByRole('button', { name: /create expense/i }).click();
    const captured = await consumeCreateCapture(capture.postPromise, capture.responsePromise);

    const createdId = await assertKeyedCreate(captured);

    // Same key + same payload (lost response scenario): a replay, same entity.
    await expectReplay(page, `${API_BASE}/api/expenses`, captured.key, captured.body, createdId);

    // And the entity exists exactly once.
    const token = await apiToken(page);
    const list = await page.request.get(
      `${API_BASE}/api/expenses?search=${encodeURIComponent(description)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const rows = (await list.json()) as { data: Array<{ id: string; description: string }> };
    expect(rows.data.filter((e) => e.id === createdId)).toHaveLength(1);
    expect(rows.data.filter((e) => e.description === description)).toHaveLength(1);
  });

  test('invoice: create is keyed, same-key retry replays with no duplicate', async ({ page }) => {
    await page.goto('/dashboard/finance/invoices/new');
    await expect(page.getByPlaceholder(/INV-2026-001/i)).toBeVisible({ timeout: 15000 });
    const stamp = (Date.now() % 100000).toString(); // INV-\d{4}-\d{3,}
    const invoiceNumber = `INV-2026-${stamp}`;
    const capture = armCreateCapture(page, '/api/invoices');

    await page.getByPlaceholder(/INV-2026-001/i).fill(invoiceNumber);
    await page.getByPlaceholder(/Enter guest name/i).fill(`Idem Invoice Guest ${stamp}`);
    await page.locator('select[name="source"]').selectOption({ index: 1 });
    await page.locator('input[name="invoiceDate"]').fill('2026-10-01');
    await page.locator('input[name="discount"]').fill('0');
    await page.getByPlaceholder(/Item description/i).fill('Idem E2E stay');
    await page.locator('input[name="items.0.quantity"]').fill('2');
    await page.locator('input[name="items.0.unitPrice"]').fill('450000');
    // Pre-existing app quirk: InvoiceFormPage always passes defaultValues as
    // `initialData`, so the CREATE page's submit button is labelled
    // "Update Invoice" (it still calls invoiceService.create → POST /api/invoices).
    await page.getByRole('button', { name: /create invoice|update invoice/i }).click();
    const captured = await consumeCreateCapture(capture.postPromise, capture.responsePromise);

    const createdId = await assertKeyedCreate(captured);
    expect(captured.data.invoiceNumber).toBe(invoiceNumber);

    await expectReplay(page, `${API_BASE}/api/invoices`, captured.key, captured.body, createdId);

    // Same-key + same-payload keeps the SAME issued number (server allocation
    // is never repeated for a replay).
    const token = await apiToken(page);
    const replay = await page.request.post(`${API_BASE}/api/invoices`, {
      data: captured.body,
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': captured.key },
    });
    expect(((await replay.json()) as { data: { invoiceNumber: string } }).data.invoiceNumber).toBe(invoiceNumber);

    const list = await page.request.get(
      `${API_BASE}/api/invoices?search=${encodeURIComponent(invoiceNumber)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const rows = (await list.json()) as { data: Array<{ id: string; invoiceNumber: string }> };
    expect(rows.data.filter((i) => i.invoiceNumber === invoiceNumber)).toHaveLength(1);
    expect(rows.data.every((i) => i.id === createdId)).toBe(true);
  });

  test('reservation: wizard create is keyed, same-key retry replays with no duplicate', async ({ page }) => {
    await page.goto('/dashboard/reservations/new');
    await expect(page.getByPlaceholder(/enter guest name/i).first()).toBeVisible({ timeout: 15000 });
    const stamp = Date.now().toString(36);
    const guestName = `Idem Resv Guest ${stamp}`;
    const capture = armCreateCapture(page, '/api/reservations');

    // Step 1: guest + dates.
    await page.getByPlaceholder(/enter guest name/i).first().fill(guestName);
    const ci = new Date(); ci.setDate(ci.getDate() + 10);
    const co = new Date(); co.setDate(co.getDate() + 12);
    await page.locator('input[type="date"]').first().fill(ci.toISOString().slice(0, 10));
    await page.locator('input[type="date"]').nth(1).fill(co.toISOString().slice(0, 10));
    const notes = page.getByPlaceholder(/special requests/i).first();
    if ((await notes.count()) && (await notes.isVisible().catch(() => false))) {
      await notes.fill('Idem E2E booking');
    }
    await page.getByRole('button', { name: /save & continue/i }).first().click();

    // Step 2: pick an available room tile (native buttons, aria-pressed).
    const room = page.getByRole('button', { name: /, available$/i }).first();
    await expect(room).toBeVisible({ timeout: 15000 });
    await room.click();
    // The clicked tile re-labels from ", available" to ", selected" (it then
    // drops out of the available set — so assert on the selected set instead).
    await expect(page.getByRole('button', { name: /, selected$/i })).not.toHaveCount(0, { timeout: 10000 });
    await page.getByRole('button', { name: /save & continue/i }).first().click();

    // Step 3: pricing — the Rate Source starts empty and is required.
    const source = page.locator('select').first();
    await expect(source).toBeVisible({ timeout: 15000 });
    if (!(await source.inputValue())) await source.selectOption({ index: 1 });
    const rates = page.locator('input[type="number"]');
    const rateCount = await rates.count();
    for (let i = 0; i < rateCount; i += 1) {
      const input = rates.nth(i);
      if (await input.isVisible().catch(() => false)) await input.fill('650000');
    }
    await page.getByRole('button', { name: /save reservation/i }).click();
    const captured = await consumeCreateCapture(capture.postPromise, capture.responsePromise);

    const createdId = await assertKeyedCreate(captured);
    expect(captured.data.guestName).toBe(guestName);

    await expectReplay(page, `${API_BASE}/api/reservations`, captured.key, captured.body, createdId);

    // Same-key retry keeps the same issued reservation code.
    const token = await apiToken(page);
    const replay = await page.request.post(`${API_BASE}/api/reservations`, {
      data: captured.body,
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': captured.key },
    });
    const replayedCode = ((await replay.json()) as { data: { reservationCode: string } }).data.reservationCode;
    expect(replayedCode).toBe(captured.data.reservationCode);

    // Exactly one reservation for this guest name.
    const list = await page.request.get(
      `${API_BASE}/api/reservations?search=${encodeURIComponent(guestName)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const rows = (await list.json()) as { data: Array<{ id: string }> };
    expect(rows.data.filter((r) => r.id === createdId)).toHaveLength(1);
  });

  test('page stays error-free across the finance lists', async ({ page }) => {
    await page.goto('/dashboard/finance/expenses');
    await expect(page.getByRole('heading', { name: /expenses/i })).toBeVisible({ timeout: 15000 });
    await page.goto('/dashboard/finance/invoices');
    await expect(page.getByRole('heading', { name: /invoices/i })).toBeVisible({ timeout: 15000 });
  });
});
