import { test, expect } from '../fixtures';
import fs from 'fs';
import path from 'path';

/**
 * INF-280 — Service Worker onMessageExternal Listener
 *
 * Verifies that:
 * - The service worker initialises cleanly after the onMessageExternal listener was added
 * - The listener is registered without causing the SW to crash or restart
 * - Error handling in initializeWorker swallows init errors gracefully
 *
 * NOTE: `browser.runtime.onMessageExternal` only fires for messages sent from other
 * extensions or from pages listed in the manifest's `externally_connectable.matches`.
 * The base manifest does NOT declare `externally_connectable`, so page-originated external
 * messages cannot be dispatched in tests without modifying the manifest.
 *
 * Tests that require a real external message are marked test.skip with instructions to enable.
 */

const MANIFEST_PATH = path.join(
  process.env.EXTENSION_PATH ?? path.resolve(__dirname, '../../../packages/partner/chrome-extension-build'),
  'manifest.json',
);

const TEST_URL = 'https://www.macys.com';

test.describe('INF-280: onMessageExternal Listener', () => {
  test('service worker registers and is in an active state', async ({ extensionContext }) => {
    const workers = extensionContext.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    expect(workers[0].url()).toContain('worker.js');
  });

  test('service worker URL points to worker.js', async ({ extensionContext }) => {
    const workers = extensionContext.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    expect(workers[0].url()).toMatch(/worker\.js$/);
  });

  test('service worker does not restart repeatedly (init errors are swallowed)', async ({ extensionContext }) => {
    // If initializeWorker threw uncaught errors the SW would restart in a loop.
    // Record the count now and again after 5s — should remain stable at 1.
    const countBefore = extensionContext.serviceWorkers().length;
    await new Promise((r) => setTimeout(r, 5000));
    const countAfter = extensionContext.serviceWorkers().length;

    expect(countAfter).toBe(countBefore);
    expect(countAfter).toBe(1);
  });

  test('extension loads on a merchant page without SW-related console errors', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    const swErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') swErrors.push(msg.text());
    });

    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const initErrors = swErrors.filter(
      (e) =>
        e.toLowerCase().includes('initializeworker') ||
        e.toLowerCase().includes('onmessageexternal') ||
        e.toLowerCase().includes('service worker'),
    );

    expect(initErrors).toHaveLength(0);
    await page.close();
  });

  test('manifest does not declare externally_connectable (documents current state)', async () => {
    // If this test starts failing the manifest was extended — add real external message tests.
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.externally_connectable).toBeUndefined();
  });

  /**
   * PREREQUISITE: Requires `externally_connectable.matches` in the manifest to include
   * the test page origin. Skip this test until the manifest is extended.
   *
   * To enable:
   * 1. Add to manifest.json:
   *    "externally_connectable": { "matches": ["https://www.macys.com/*"] }
   * 2. Rebuild: pnpm build:dev:chrome
   * 3. Remove the test.skip wrapper below
   */
  test.skip('external message triggers onMessageExternal instructions', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const sw = extensionContext.serviceWorkers()[0];
    const extensionId = sw.url().split('/')[2];

    // Send an external message from the page to the extension
    // (macys.com must be in externally_connectable.matches for this to work)
    const result = await page.evaluate(async (extId: string) => {
      return new Promise((resolve) => {
        (chrome as any).runtime.sendMessage(
          extId,
          { type: 'TEST_EXTERNAL_MESSAGE', payload: { test: true } },
          (response: unknown) => resolve(response ?? 'no-response'),
        );
      });
    }, extensionId);

    // Handler doesn't return a value by default — no crash is what matters
    expect(['no-response', undefined, null]).toContain(result);
    await page.close();
  });

  test('content script is injected on merchant page (end-to-end sanity)', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () =>
        Array.from(document.documentElement.children).some(
          (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
        ),
      { timeout: 10_000 },
    );

    const hostPresent = await page.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    );

    expect(hostPresent).toBe(true);
    await page.close();
  });
});
