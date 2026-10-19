import { test, expect } from '@playwright/test';
import { attachErrorCollectors, loginAsAdmin, login, MANAGER, STAFF } from './helpers';

test.describe('SCN-06 Users Roles Permissions', () => {
  test.beforeEach(async ({ page }) => {
    attachErrorCollectors(page);
    await loginAsAdmin(page);
  });

  test('SCN-06-01 users list renders', async ({ page }) => {
    await page.goto('/dashboard/users');
    await expect(page.getByRole('heading', { name: /pengguna/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/search by name or email/i)).toBeVisible();
  });

  test('SCN-06-02/03 create user via form page + duplicate shows error', async ({ page }) => {
    const stamp = Date.now();
    const email = `u${stamp}@hotel.com`;
    await page.goto('/dashboard/users/new');
    const nameInput = page.getByPlaceholder('John Doe');
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.fill(`E2E ${stamp}`);
    await page.getByPlaceholder('john@hotel.com').fill(email);
    const pw = page.getByPlaceholder('Min 6 characters');
    if (await pw.count()) await pw.first().fill('password123');
    // select a role: options are [disabled placeholder, empty 'Select a role', ...real roles]
    const roleSelect = page.locator('select').first();
    if (await roleSelect.count()) await roleSelect.selectOption({ index: 2 }).catch(() => {});
    await page.getByRole('button', { name: /create user/i }).click();
    // UserFormPage onSuccess SPA-navigates to /dashboard/users. The backend is
    // persistent, so earlier runs' rows may push the new user to page 2 —
    // search for it instead of assuming it is visible on page 1.
    await expect(page).toHaveURL(/\/dashboard\/users$/, { timeout: 15000 });
    const search = page.getByPlaceholder(/search by name or email/i);
    await search.fill(email);
    await expect(page.locator('body')).toContainText(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 });
    await search.fill('');

    // Duplicate email via the list's "Add User" modal (same page, no reload so the
    // in-memory record survives): modal stays open with inline error (FIXED).
    await page.getByRole('button', { name: /add user/i }).first().click({ timeout: 10000 });
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await modal.getByPlaceholder('John Doe').fill('Dup User');
    await modal.getByPlaceholder('john@hotel.com').fill(email);
    const pwModal = modal.getByPlaceholder('Min 6 characters');
    if (await pwModal.count()) await pwModal.first().fill('password123');
    const modalRole = modal.locator('select').first();
    if (await modalRole.count()) await modalRole.selectOption({ index: 2 }).catch(() => {});
    await modal.getByRole('button', { name: /create user/i }).click();
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal).toContainText(/already registered/i, { timeout: 10000 });
    await page.keyboard.press('Escape');
  });

  test('SCN-06-04 user detail opens', async ({ page }) => {
    await page.goto('/dashboard/users');
    const view = page.getByRole('link', { name: /view/i }).first();
    await expect(view).toBeVisible({ timeout: 15000 });
    await view.click();
    await expect(page).toHaveURL(/\/dashboard\/users\/.+/, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/user information|name|email/i);
  });

  test('SCN-06-06/07 roles list + create role', async ({ page }) => {
    await page.goto('/dashboard/roles');
    await expect(page.getByRole('heading', { name: /jabatan/i })).toBeVisible({ timeout: 15000 });
    const create = page.getByRole('button', { name: /create role/i }).first();
    await expect(create).toBeVisible();
    await create.click();
    const stamp = Date.now().toString().slice(-5);
    const modal = page.getByRole('dialog');
    if (await modal.count()) {
      await expect(modal).toBeVisible({ timeout: 10000 });
      const nameIn = page.getByPlaceholder(/e\.g\., manager/i).or(page.locator('input[type="text"]').first());
      await nameIn.first().fill(`E2E Role ${stamp}`);
      const cb = page.locator('input[type="checkbox"]').first();
      if (await cb.count()) await cb.check().catch(() => {});
      await page.getByRole('button', { name: /create role/i }).last().click();
      await page.waitForTimeout(1200);
    } else {
      await expect(page).toHaveURL(/\/dashboard\/roles\/new/);
    }
  });

  test('SCN-06-09 permissions list renders', async ({ page }) => {
    await page.goto('/dashboard/permissions');
    // Wait for the page heading to confirm the permissions page has mounted
    await expect(page.getByRole('heading', { name: 'Akses' })).toBeVisible({ timeout: 15000 });
    // Wait for at least one permission cell to confirm data has finished loading
    await expect(page.getByRole('cell', { name: 'user.view' })).toBeVisible({ timeout: 15000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/permission|user\.view|reservation/i);
  });

  test('SCN-06-10 staff denied finance + activity shows Akses Ditolak', async ({ page }) => {
    // beforeEach logged in as admin — must clear session first, otherwise
    // /login bounces back to /dashboard via PublicOnlyRoute (previous timeout cause).
    await page.evaluate(() => { localStorage.removeItem('pms_token'); localStorage.removeItem('pms_user'); });
    await login(page, STAFF.email, STAFF.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/dashboard/finance/sales');
    await expect(page.locator('body')).toContainText(/akses ditolak|tidak memiliki izin/i, { timeout: 10000 });
    await page.goto('/dashboard/activity');
    await expect(page.locator('body')).toContainText(/akses ditolak|tidak memiliki izin/i, { timeout: 10000 });
  });

  test('SCN-06-11 manager login succeeds and users list renders', async ({ page }) => {
    // Same session hygiene as SCN-06-10: clear the admin session first.
    // Manager (role-002) holds user.view, so the users list is the
    // manager-permitted action under test — existing UI flow only.
    await page.evaluate(() => { localStorage.removeItem('pms_token'); localStorage.removeItem('pms_user'); });
    await login(page, MANAGER.email, MANAGER.password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    expect(await page.evaluate(() => localStorage.getItem('pms_token'))).not.toBeNull();
    await page.goto('/dashboard/users');
    await expect(page.getByRole('heading', { name: /pengguna/i })).toBeVisible({ timeout: 15000 });
  });
});
