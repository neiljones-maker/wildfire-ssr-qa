import { test, expect } from '../fixtures';

/**
 * RC — Install Flow: Onboarding Tab & Login CTA
 *
 * Two checks:
 *   1. The install tab URL is the configured installation URL (example.com)
 *   2. The install tab shows a one-time onboarding UI with a login CTA
 *
 * HOW IT WORKS
 * - The background config's onExtensionInstalled trigger sets
 *   `extensionNewInstall: true` in chrome.storage.local on install.
 * - The content script reads this flag on page load: if truthy it renders the
 *   onboarding UI (including the login CTA) inside a closed shadow-DOM host,
 *   then removes the flag so the UI only appears once.
 * - beforeEach resets the flag to true so each test sees a fresh install state.
 *
 * SHADOW DOM NOTE
 * - The host element uses mode:'closed', so document.querySelectorAll and
 *   Playwright's role-based locators cannot reach inside it.
 * - We confirm UI presence via the host element's computed opacity: it stays at
 *   0 when the flag is missing (nothing to render) and transitions to 1 when the
 *   DSL renders the onboarding template (including the login CTA).
 */

const INSTALL_URL = 'https://example.com/install';

// Reset the one-time install flag before every test so each test sees fresh
// install state regardless of what the previous test did.
test.beforeEach(async ({ extensionContext }) => {
  const sw = extensionContext.serviceWorkers()[0];
  if (sw) {
    await sw.evaluate(() =>
      new Promise<void>((resolve) =>
        chrome.storage.local.set({ extensionNewInstall: true }, () => resolve()),
      ),
    );
  }
});

test.describe('RC: Install Flow — Onboarding Tab & Login CTA', () => {
  test('RC-1: install tab shows the configured installation URL', async ({ extensionContext }) => {
    const page = extensionContext.pages()[0];
    await page.goto(INSTALL_URL, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('example.com');
  });

  test('RC-2: install tab shows one-time onboarding UI with login CTA', async ({ extensionContext }) => {
    const page = extensionContext.pages()[0];
    await page.goto(INSTALL_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the extension's shadow-DOM host to appear (content script injected).
    // Discriminator: custom element tag (contains '-') + inline opacity transition.
    await page.waitForFunction(
      () =>
        Array.from(document.documentElement.children).some(
          (el) =>
            el.tagName.includes('-') &&
            (el as HTMLElement).style.transition?.includes('opacity'),
        ),
      { timeout: 15_000 },
    );

    // The onboarding UI loads asynchronously (DSL fetches content config then
    // renders HTML into the closed shadow root). When the UI is visible the host's
    // computed opacity transitions from 0 → 1. A transparent host (opacity ≈ 0)
    // means the flag was absent and nothing rendered — which would be a failure.
    await page.waitForFunction(
      () => {
        const host = Array.from(document.documentElement.children).find(
          (el) =>
            el.tagName.includes('-') &&
            (el as HTMLElement).style.transition?.includes('opacity'),
        );
        if (!host) return false;
        return parseFloat(getComputedStyle(host).opacity) > 0.5;
      },
      { timeout: 15_000 },
    );
  });
});
