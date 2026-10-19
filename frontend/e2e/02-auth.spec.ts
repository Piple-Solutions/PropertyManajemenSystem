import { test, expect } from '@playwright/test';
import { attachErrorCollectors, ADMIN, INACTIVE, login } from './helpers';

test.describe('SCN-02 Authentication', () => {
  test('SCN-02-01 login page renders', async ({ page }) => {
    attachErrorCollectors(page);
    await page.goto('/login');
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    await expect(page.getByPlaceholder('john@hotel.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Login$/ })).toBeVisible();
  });

  test('SCN-02-02 invalid credentials stay on login with alert', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, 'wrong@hotel.com', 'wrongpass');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('SCN-02-03 inactive user cannot login', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, INACTIVE.email, INACTIVE.password);
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
    const token = await page.evaluate(() => localStorage.getItem('pms_token'));
    expect(token).toBeNull();
  });

  test('SCN-02-04 admin login success sets token', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    const token = await page.evaluate(() => localStorage.getItem('pms_token'));
    expect(token).toBeTruthy();
    await expect(page.getByText(/joglo seruni/i).first()).toBeVisible();
  });

  test('SCN-02-05 public-only guard redirects authed /login to dashboard', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('SCN-02-06 protected guard redirects unauth to login', async ({ page }) => {
    attachErrorCollectors(page);
    await page.goto('/');
    await page.evaluate(() => { localStorage.removeItem('pms_token'); localStorage.removeItem('pms_user'); });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('SCN-02-07 register closed, 403 stays unauthenticated with error', async ({ page }) => {
    attachErrorCollectors(page);
    const stamp = Date.now();
    const email = `e2e${stamp}@hotel.com`;
    await page.goto('/register');
    await expect(page.getByText(/create account/i)).toBeVisible();
    await page.getByPlaceholder('John Doe').fill(`E2E User ${stamp}`);
    await page.getByPlaceholder('john@hotel.com').fill(email);
    await page.getByPlaceholder('Min 6 characters').first().fill('password123');
    await page.getByPlaceholder('Confirm password').fill('password123');
    await page.getByRole('button', { name: /sign up/i }).click();
    // Approved closed-registration contract (BE-001): POST /register answers
    // 403, the rejection surfaces visibly, and no session is created. The
    // form navigates to /login without authenticating.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.getByRole('alert')).toContainText(/dinonaktifkan/i, { timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('pms_token'))).toBeNull();

    // Still unauthenticated: protected routes bounce back to /login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('SCN-02-08/09 forgot password resets for real, generic message for unknown [FIXED]', async ({ page }) => {
    attachErrorCollectors(page);
    // Known email: generic status, then set a new password, then log in with it.
    await page.goto('/forgot-password');
    await page.getByPlaceholder('john@hotel.com').fill(ADMIN.email);
    await page.getByRole('button', { name: /send reset link/i }).click();
    // Two role=status elements render in dev (generic message + dev reset-link
    // notice) — assert on the generic message element precisely.
    await expect(page.getByRole('status').first()).toContainText(/if an account.*exists/i, { timeout: 10000 });
    // Follow the dev-mode reset link to the token form (no email provider locally).
    await page.getByRole('link', { name: /reset password/i }).click();
    await expect(page).toHaveURL(/\/reset-password\?token=/, { timeout: 10000 });
    await page.getByPlaceholder('Min 6 characters').fill('newpass456');
    await page.getByPlaceholder('Confirm password').fill('newpass456');
    await page.getByRole('button', { name: /reset password/i }).click();
    await expect(page.getByRole('status')).toContainText(/successfully/i, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    // Persistence proof: login works with the NEW password (same page context).
    await page.getByPlaceholder('john@hotel.com').fill(ADMIN.email);
    await page.getByPlaceholder('Enter your password').fill('newpass456');
    await page.getByRole('button', { name: /^Login$/ }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Restore the shared seed admin password so later specs keep working.
    await page.evaluate(() => { localStorage.removeItem('pms_token'); localStorage.removeItem('pms_user'); });
    await page.goto('/forgot-password');
    await page.getByPlaceholder('john@hotel.com').fill(ADMIN.email);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByRole('status').first()).toContainText(/if an account.*exists/i, { timeout: 10000 });
    await page.getByRole('link', { name: /reset password/i }).click();
    await expect(page).toHaveURL(/\/reset-password\?token=/, { timeout: 10000 });
    await page.getByPlaceholder('Min 6 characters').fill('admin123');
    await page.getByPlaceholder('Confirm password').fill('admin123');
    await page.getByRole('button', { name: /reset password/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Unknown email: identical generic message (no enumeration oracle).
    await page.evaluate(() => { localStorage.removeItem('pms_token'); localStorage.removeItem('pms_user'); });
    await page.goto('/forgot-password');
    await page.getByPlaceholder('john@hotel.com').fill('unknown@x.com');
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByRole('status').first()).toContainText(/if an account.*exists/i, { timeout: 10000 });
  });

  test('SCN-02-10 reset password without token shows message', async ({ page }) => {
    attachErrorCollectors(page);
    await page.goto('/reset-password');
    await expect(page.locator('body')).toContainText(/no reset token|token/i);
  });

  test('SCN-02-11 change password form visible (auth)', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible({ timeout: 10000 });
  });

  test('SCN-02-12 logout clears session', async ({ page }) => {
    attachErrorCollectors(page);
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/);
    const btn = page.getByRole('button', { name: /logout/i }).first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('pms_token'));
    expect(token).toBeNull();
  });
});
