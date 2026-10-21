import { defineConfig, devices } from '@playwright/test';

/** Lets a sandbox use its preinstalled Chromium instead of downloading one. */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
/** Tests an already running instance (e.g. the nginx container) instead of `vite preview`. */
const externalUrl = process.env.PHANES_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalUrl ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  ...(externalUrl
    ? {}
    : {
        webServer: {
          command: 'pnpm build && pnpm preview --port 4173 --strictPort --host 127.0.0.1',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
