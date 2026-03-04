import { test, expect } from '../fixtures';
import { BrowserContext, Page } from '@playwright/test';

/**
 * RC — Install Flow: Onboarding Tab & Login CTA
 *
 * Verifies that:
 * - A new tab opens to the configured installation URL (example.com) on install
 * - The extension injects a one-time onboarding UI into that tab
 * - The UI does not re-appear on subsequent visits (one-time flag)
 * - A login CTA is present on the install tab
 *
 * TIMING NOTE: The fixture yields as soon as the service worker registers.
 * The SW's onInstalled handler runs asynchronously after initialisation, so
 * the install tab may not have opened yet — or may be mid-navigation with
 * its URL still at about:blank — when the first test runs.
 *
 * waitForInstallTab() is race-condition-free:
 *   1. Attaches a 'page' listener BEFORE scanning existing pages (no gap)
 *   2. For every page (new or existing), waits for URL to reach example.com
 *
 * SHADOW DOM NOTE: The host element uses mode:'closed'. All UI assertions
 * run via page.evaluate() in the page's own JS context.
 */

const INSTALL_URL = 'example.com';

/**
 * Race-condition-free helper that returns the install tab.
 *
 * Sets up the new-page listener before checking existing pages so a tab
 * that opens between the two steps is never missed. For every candidate
 * page it waits for the URL to settle at example.com (handles the case
 * where the page exists but is still navigating from about:blank).
 */
async function waitForInstallTab(context: BrowserContext, timeout = 20_000): Promise<Page> {
  return new Promise<Page>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const urls = context.pages().map((p) => p.url()).join(', ');
        reject(
          new Error(
            `Install tab (${INSTALL_URL}) did not open within ${timeout}ms.\n` +
              `Pages open at timeout: [${urls}]`,
          ),
        );
      }
    }, timeout);

    const tryPage = async (page: Page) => {
      if (settled) return;
      try {
        if (!page.url().includes(INSTALL_URL)) {
          await page.waitForURL(`**${INSTALL_URL}**`, { timeout: timeout - 1000 });
        }
        if (!settled && page.url().includes(INSTALL_URL)) {
          settled = true;
          clearTimeout(timer);
          resolve(page);
        }
      } catch {
        // This page won't reach the install URL — ignore it
      }
    };

    // 1. Set up listener for pages that open in the future (before scanning)
    context.on('page', tryPage);

    // 2. Check pages that are already open
    for (const page of context.pages()) {
      tryPage(page);
    }
  });
}

/**
 * Waits for the extension host element on the given page.
 * Discriminator: hyphenated tag name + inline opacity transition,
 * which is unique to our injectNotification() host element.
 */
async function waitForOnboardingHost(page: Page, timeout = 10_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        Array.from(document.documentElement.children).some(
          (el) =>
            el.tagName.includes('-') &&
            (el as HTMLElement).style.transition?.includes('opacity'),
        ),
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

test.describe('RC: Install Flow — Onboarding Tab & Login CTA', () => {
  test('RC-1: install tab opens automatically after extension install', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    expect(installTab.url()).toContain(INSTALL_URL);
    await installTab.close();
  });

  test('RC-2: install tab URL is the configured installation URL', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    await installTab.waitForLoadState('domcontentloaded');
    expect(installTab.url()).toContain(INSTALL_URL);
    await installTab.close();
  });

  test('RC-3: extension injects onboarding UI into the install tab', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    await installTab.waitForLoadState('domcontentloaded');
    const hostPresent = await waitForOnboardingHost(installTab);
    expect(hostPresent).toBe(true);
    await installTab.close();
  });

  test('RC-4: onboarding UI does not re-appear after page reload (one-time only)', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    await installTab.waitForLoadState('domcontentloaded');

    const hostOnFirstLoad = await waitForOnboardingHost(installTab);
    expect(hostOnFirstLoad).toBe(true);

    await installTab.reload({ waitUntil: 'domcontentloaded' });
    await installTab.waitForTimeout(3000);

    const hostAfterReload = await installTab.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) =>
          el.tagName.includes('-') &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ),
    );

    expect(hostAfterReload).toBe(false);
    await installTab.close();
  });

  test('RC-5: login CTA is present on the install tab', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    await installTab.waitForLoadState('domcontentloaded');
    await waitForOnboardingHost(installTab);

    const hasLoginCTA = await installTab.evaluate(() => {
      const terms = ['log in', 'login', 'sign in', 'signin'];
      const els = Array.from(
        document.querySelectorAll<HTMLElement>('a, button, [role="button"]'),
      );
      return els.some((el) => {
        const text = (el.textContent ?? '').toLowerCase();
        const href = ((el as HTMLAnchorElement).href ?? '').toLowerCase();
        return terms.some((t) => text.includes(t) || href.includes(t));
      });
    });

    expect(hasLoginCTA).toBe(true);
    await installTab.close();
  });
});
