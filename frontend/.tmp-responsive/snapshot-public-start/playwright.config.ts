import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    headless: false, // headed browser as requested
    launchOptions: {
      slowMo: 150,
    },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1366, height: 768 },
  },
  // Serves the PRODUCTION build (`vite preview`), not the dev server, so the
  // suite exercises the same artifact that gets deployed. Pinned to 5173 —
  // not preview's default 4173 — so `baseURL` above stays valid.
  //
  // The backend is a manual prerequisite (`cd backend && npm run dev` on 8787):
  // it needs a one-time `d1 migrations apply --local` + `db:seed:local`, and
  // tests that need data cannot bootstrap that themselves.
  webServer: {
    command: 'npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium-headed',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
      },
    },
  ],
});
