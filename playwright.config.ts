import { defineConfig, devices } from '@playwright/test';

// Some sandboxes ship a preinstalled Chromium that does not match the revision
// this Playwright version would download. Point CHROMIUM_PATH at that binary to
// reuse it; CI leaves the variable unset and uses `playwright install`.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail the build if a `test.only` is committed by accident.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  // E2E runs against the production build, so the suite catches bundling and
  // asset problems that the dev server would paper over.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
