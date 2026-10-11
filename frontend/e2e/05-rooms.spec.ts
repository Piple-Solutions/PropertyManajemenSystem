import { test, expect } from '@playwright/test';
import { attachErrorCollectors, loginAsAdmin } from './helpers';

test.describe('SCN-05 Rooms & Room Types', () => {
  test.beforeEach(async ({ page }) => {
    attachErrorCollectors(page);
    await loginAsAdmin(page);
  });

  test('SCN-05-01/02 room list + search', async ({ page }) => {
    await page.goto('/dashboard/rooms');
    await expect(page.getByRole('heading', { name: /rooms/i })).toBeVisible({ timeout: 15000 });
    const search = page.getByPlaceholder(/search room number/i);
    await expect(search).toBeVisible();
    await search.fill('101');
    await page.waitForTimeout(700);
    await search.fill('');
  });

  test('SCN-05-03/04 create room succeeds, no ref warnings [FIXED]', async ({ page }) => {
    const refWarnings: string[] = [];
    page.on('console', (m) => { if (m.text().includes('cannot be given refs')) refWarnings.push(m.text()); });
    await page.goto('/dashboard/rooms');
    await page.getByRole('button', { name: /new room/i }).first().click({ timeout: 10000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const stamp = Date.now().toString().slice(-5);
    const roomNo = `9${stamp}`;
    await dialog.getByPlaceholder(/e\.g\., 101/i).fill(roomNo);
    // Select options: [disabled Pilih..., empty 'Select room type...', ...real types]
    await dialog.locator('select').first().selectOption({ index: 2 });
    expect(await dialog.locator('select').first().inputValue()).not.toBe('');
    await dialog.getByRole('button', { name: /^create$/i }).click();
    // FIXED (forwardRef): modal closes and the new room appears — no validation error.
    await expect(dialog).toBeHidden({ timeout: 10000 });
    // Table is paginated: search for the new room so it lands on page 1.
    const search = page.getByPlaceholder(/search room number/i);
    await search.fill(roomNo);
    await expect(page.locator('table')).toContainText(new RegExp(roomNo), { timeout: 10000 });
    expect(refWarnings).toEqual([]);
  });

  test('SCN-05-07/08 room type create succeeds, no ref warnings [FIXED]', async ({ page }) => {
    const refWarnings: string[] = [];
    page.on('console', (m) => { if (m.text().includes('cannot be given refs')) refWarnings.push(m.text()); });
    await page.goto('/dashboard/room-types');
    await expect(page.getByRole('heading', { name: /room types/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /new room type/i }).first().click({ timeout: 10000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const stamp = Date.now().toString().slice(-5);
    const name = `E2E Type ${stamp}`;
    await dialog.getByPlaceholder(/e\.g\., standard/i).fill(name);
    await dialog.getByPlaceholder(/describe the room type/i).fill('E2E desc');
    await dialog.locator('input[type="number"]').nth(0).fill('2');
    await dialog.locator('input[type="number"]').nth(1).fill('750000');
    const fac = dialog.getByPlaceholder(/wifi, tv/i);
    if (await fac.count()) await fac.fill('WiFi, TV');
    await dialog.getByRole('button', { name: /^create$/i }).click();
    // FIXED (forwardRef): modal closes and the new type appears in the table.
    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(page.locator('body')).toContainText(name, { timeout: 10000 });
    expect(refWarnings).toEqual([]);
  });
});
