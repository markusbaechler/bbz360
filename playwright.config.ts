import { defineConfig, devices } from '@playwright/test';

// Smoke-Tests je Modul (Brief Schritt 3 / ADR-6). Laeuft gegen den Vite-Preview-Build.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173/bbz360/',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/bbz360/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
