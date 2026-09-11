import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    // Never save traces or screenshots containing the checkout form.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
