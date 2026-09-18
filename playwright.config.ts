import { defineConfig, devices } from '@playwright/test';
import { requireLocalTarget, testDatabase } from './playwright-tests/fixtures/testSafety';

// Fail before test collection, setup, credentials or a dev server can be used.
const database = testDatabase();
requireLocalTarget(process.env.STOCKER_TEST_API);
if (process.env.SMOKE_URL) requireLocalTarget(process.env.SMOKE_URL);
if (!process.env.STOCKERAI_TEST_ANON_KEY) throw new Error('Disposable test anon key required');
process.env.VITE_SUPABASE_URL = database.url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.STOCKERAI_TEST_ANON_KEY;

export default defineConfig({
  testDir: './playwright-tests',
  // Browser specs only. The fixtures folder also holds plain unit tests (*.test.ts) that
  // belong to the other runner; picking those up made the browser runner crash on startup
  // with a matcher clash, so the ENTIRE browser suite has been unable to run. Narrowing the
  // match to .spec.ts leaves each runner with its own files.
  testMatch: '**/*.spec.ts',
  fullyParallel: false, // Run serially to avoid state conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid route conflicts
  reporter: 'html',
  globalSetup: './playwright-tests/globalSetup.ts',

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: false, // An existing server may have loaded production settings.
    timeout: 120000,
  },
});
