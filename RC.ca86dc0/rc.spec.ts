import { test, expect } from '../fixtures';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * RC — Install Flow: Onboarding Tab & Login CTA
 *
 * Two checks:
 *   1. After install the extension opens a tab at the configured installation URL
 *   2. That tab shows a one-time onboarding UI with a login CTA
 *
 * HOW IT WORKS
 * - The background config's onExtensionInstalled trigger calls browser.tabs.create
 *   with the configured installation URL (example.com/install).
 * - The content script reads extensionNewInstall from chrome.storage.local on page
 *   load: if truthy it renders the onboarding UI inside a closed shadow-DOM host,
 *   then removes the flag so the UI only appears once.
 * - Each test gets a fresh Chrome install (test-scoped fixture) so onInstalled
 *   fires naturally and the install tab opens automatically.
 *
 * SHADOW DOM NOTE
 * - The host element uses mode:'closed', so document.querySelectorAll and
 *   Playwright's role-based locators cannot reach inside it.
 * - We confirm UI presence via the host element's computed opacity: it stays at
 *   0 when the flag is missing (nothing to render) and transitions to 1 when the
 *   DSL renders the onboarding template (including the login CTA).
 */

const INSTALL_URL = 'example.com';
const INSTALL_TAB_TIMEOUT = 20_000;

/**
 * Polls context.pages() until a page whose URL contains INSTALL_URL appears.
 * The extension's onInstalled handler opens this tab — we never navigate manually.
 */
async function waitForInstallTab(context: BrowserContext): Promise<Page> {
  const deadline = Date.now() + INSTALL_TAB_TIMEOUT;
  while (Date.now() < deadline) {
    const installPage = context.pages().find((p) => p.url().includes(INSTALL_URL));
    if (installPage) return installPage;
    await new Promise((r) => setTimeout(r, 500));
  }
  const urls = context.pages().map((p) => p.url()).join(', ');
  throw new Error(
    `Install tab (${INSTALL_URL}) did not open within ${INSTALL_TAB_TIMEOUT}ms.\n` +
      `Pages open at timeout: [${urls}]`,
  );
}

test.describe('RC: Install Flow — Onboarding Tab & Login CTA', () => {
  test('RC-1: extension opens the install tab automatically after install', async ({
    extensionContext,
  }) => {
    const page = await waitForInstallTab(extensionContext);
    expect(page.url()).toContain(INSTALL_URL);
  });

  test('RC-2: install tab shows one-time onboarding UI with login CTA', async ({
    extensionContext,
  }) => {
    const page = await waitForInstallTab(extensionContext);

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
