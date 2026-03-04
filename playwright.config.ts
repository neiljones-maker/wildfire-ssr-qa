import { defineConfig } from '@playwright/test';

/**
 * Extension build output: packages/partner/chrome-extension-build
 * Run `pnpm build:dev:chrome` before running these tests.
 *
 * Browser launch with the extension loaded is handled by the shared fixture
 * in fixtures.ts — not here — because Chrome extensions require
 * launchPersistentContext which cannot be configured via projects.use.launchOptions.
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  workers: 1, // Run one spec file at a time — each launches its own Chrome instance
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT ?? 'playwright-report', open: 'always' }],
  ],
  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
});
