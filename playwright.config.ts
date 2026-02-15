import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './playwright-tests',
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
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
