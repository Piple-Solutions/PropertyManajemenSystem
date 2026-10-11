import { defineConfig } from '@playwright/test';

// Temporary capture config for Phase 1 baseline (read-only).
// Reuses the already-running `vite preview` on 5173 and backend on 8787.
export default defineConfig({
  testDir: './',
  timeout: 180 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
