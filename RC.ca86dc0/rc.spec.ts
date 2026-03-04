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
 * NOTE: The fixture creates a fresh user data directory on every run, so
 * chrome.runtime.onInstalled always fires with reason:'install'. The install
 * tab is typically already open by the time the first test runs (opened during
 * service worker initialisation), so we check existing pages first before
 * falling back to waitForEvent.
 *
 * NOTE: The shadow root is mode:'closed', so internal UI content is not
 * directly queryable by Playwright. Assertions use page.evaluate() and check
 * light-DOM affordances where possible.
 */

const INSTALL_URL_PATTERN = 'example.com';

/**
 * Returns the install tab. Checks already-open pages first to avoid a race
 * where the tab opened before the listener was attached.
 */
async function waitForInstallTab(context: BrowserContext, timeout = 15_000): Promise<Page> {
  const existing = context.pages().find((p) => p.url().includes(INSTALL_URL_PATTERN));
  if (existing) return existing;

  return context.waitForEvent('page', {
    predicate: (p) => p.url().includes(INSTALL_URL_PATTERN),
    timeout,
  });
}

/**
 * Returns true once the extension host element (identified by its unique
 * inline opacity transition) appears on the given page.
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
    expect(installTab).toBeTruthy();
    await installTab.close();
  });

  test('RC-2: install tab URL is the configured installation URL', async ({ extensionContext }) => {
    const installTab = await waitForInstallTab(extensionContext);
    await installTab.waitForLoadState('domcontentloaded');

    expect(installTab.url()).toContain(INSTALL_URL_PATTERN);
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

    // Confirm it appeared first
    const hostOnFirstLoad = await waitForOnboardingHost(installTab);
    expect(hostOnFirstLoad).toBe(true);

    // Reload and wait — the one-time flag should suppress re-injection
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

    // Search light-DOM links and buttons for login-related text or href.
    // If the CTA lives inside the closed shadow root it won't be reachable
    // here — in that case update this assertion once the implementation is known.
    const hasLoginCTA = await installTab.evaluate(() => {
      const loginTerms = ['log in', 'login', 'sign in', 'signin'];
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('a, button, [role="button"]'),
      );
      return elements.some((el) => {
        const text = (el.textContent ?? '').toLowerCase();
        const href = ((el as HTMLAnchorElement).href ?? '').toLowerCase();
        return loginTerms.some((term) => text.includes(term) || href.includes(term));
      });
    });

    expect(hasLoginCTA).toBe(true);
    await installTab.close();
  });
});
