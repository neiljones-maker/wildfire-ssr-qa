import { test as base, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

export { expect } from '@playwright/test';

// Allow CI to override the extension path via env var.
// Locally defaults to the monorepo build output.
const EXTENSION_PATH =
  process.env.EXTENSION_PATH ??
  path.resolve(__dirname, '../../packages/partner/chrome-extension-build');

/**
 * Polls until the extension's service worker appears in the context.
 * Event-based waiting (waitForEvent) is unreliable — if the SW registers before
 * the listener is attached the event is missed and the call hangs forever.
 */
async function waitForExtensionServiceWorker(
  context: BrowserContext,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (context.serviceWorkers().length > 0) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Extension service worker did not register within ${timeoutMs}ms.\n` +
      `Ensure the extension is built first: pnpm build:dev:chrome\n` +
      `Expected build output at: ${EXTENSION_PATH}`,
  );
}

/**
 * Worker-scoped fixture: one Chrome instance per spec file, torn down after all
 * tests in that file complete.
 *
 * IMPORTANT: Do NOT use channel:'chrome' (system Chrome). macOS security
 * restrictions cause system Chrome to silently ignore --load-extension.
 * Playwright's bundled Chromium is the correct runtime for extension testing
 * and fully supports MV3 service workers.
 *
 * An explicit temp userDataDir is used instead of '' because the empty-string
 * shorthand behaves inconsistently across Playwright versions.
 */
export const test = base.extend<Record<string, never>, { extensionContext: BrowserContext }>({
  extensionContext: [
    async ({}, use) => {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));

      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--no-sandbox',
        ],
      });

      await waitForExtensionServiceWorker(context);

      await use(context);
      await context.close();

      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
});
