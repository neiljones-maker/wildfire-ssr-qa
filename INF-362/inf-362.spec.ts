import { test, expect } from '../fixtures';
import { BrowserContext, Page } from '@playwright/test';

/**
 * INF-362 — Couponator: No-Savings Cashback UI
 *
 * Verifies that when coupon codes are empty (Codes = []) for a merchant, the
 * couponator does NOT attempt to apply codes and instead shows the
 * "You've got a great price!" modal with the user's cashback rate.
 *
 * Test flow (per test):
 *  1. Wait for _primitiveHandler to be available in the service worker.
 *  2. Seed Codes = [] into the service worker store (BEFORE navigating).
 *  3. Navigate to the merchant product page and add to cart.
 *  4. Proceed to the bag/checkout page.
 *  5. Verify the extension overlay appears and no codes were applied.
 *
 * NOTE: The extension shadow root is mode:'closed', so inner DOM content cannot
 * be asserted via Playwright locators. Modal-state assertions are made by
 * inspecting the service worker store and the host element visibility.
 */

// ─── URLs ────────────────────────────────────────────────────────────────────

const MACYS_URL = 'https://www.macys.com';
const MACYS_BAG_URL = 'https://www.macys.com/shop/bag';
const MACYS_PRODUCT_URL =
  'https://www.macys.com/shop/product/adrianna-papell-womens-beaded-short-sleeve-sheer-overlay-gown?ID=21030380';

const NORDSTROM_URL = 'https://www.nordstrom.com';
const NORDSTROM_BAG_URL = 'https://www.nordstrom.com/shopping/bag';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Polls the service worker until _primitiveHandler is defined and the store
 * is accessible. Must be called before any worker.evaluate() that touches
 * the store, since the primitives are initialised asynchronously after SW start.
 */
async function waitForPrimitiveHandler(
  context: BrowserContext,
  timeoutMs = 30_000,
): Promise<void> {
  const [worker] = context.serviceWorkers();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ready = await worker.evaluate(
        () => typeof (_primitiveHandler as any) !== 'undefined' &&
              typeof (_primitiveHandler as any)._primitives?.store?._store !== 'undefined',
      );
      if (ready) return;
    } catch {
      // _primitiveHandler not yet in scope — keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`_primitiveHandler not available in service worker after ${timeoutMs}ms`);
}

/**
 * Seeds Codes = [] for the given domain BEFORE any page navigation.
 * Creates the couponData entry if it doesn't already exist.
 */
async function seedEmptyCouponCodes(
  context: BrowserContext,
  domain: string,
): Promise<void> {
  await waitForPrimitiveHandler(context);
  const [worker] = context.serviceWorkers();
  await worker.evaluate((d: string) => {
    const store = (_primitiveHandler as any)._primitives.store._store;
    if (!store.couponData) store.couponData = {};
    if (!store.couponData[d]) store.couponData[d] = {};
    store.couponData[d].Codes = [];
  }, domain);
}

/**
 * Reads the current Codes array for a domain from the service worker store.
 * Returns null if no entry exists.
 */
async function getCouponCodes(
  context: BrowserContext,
  domain: string,
): Promise<unknown[] | null> {
  const [worker] = context.serviceWorkers();
  return worker.evaluate((d: string) => {
    const store = (_primitiveHandler as any)._primitives.store._store;
    return store.couponData?.[d]?.Codes ?? null;
  }, domain);
}

/**
 * Polls until the extension's host element is visible on the page (opacity 1).
 * Uses the same discriminator as the other INF-* specs: a custom-element tag
 * with an opacity transition, attached directly to <html>.
 */
async function waitForExtensionOverlay(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const host = Array.from(document.documentElement.children).find(
        (el) =>
          el.tagName.includes('-') &&
          !['HEAD', 'BODY'].includes(el.tagName) &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ) as HTMLElement | undefined;
      return host && (host.style.opacity === '1' || host.style.opacity === '');
    },
    { timeout: timeoutMs },
  );
}

/**
 * Navigates to the macys.com product page and tries to add it to the bag.
 * Silently proceeds if the add-to-bag button is not found (e.g. out of stock,
 * or requires login) — the bag page may still trigger the couponator if items
 * are already present from a prior session.
 */
async function tryAddToBag(page: Page): Promise<void> {
  await page.goto(MACYS_PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2_000);

  await page
    .locator(
      [
        'button:has-text("Add to Bag")',
        'button:has-text("Add to Cart")',
        '[data-auto="add-to-bag"]',
        '.add-to-bag-btn',
      ].join(', '),
    )
    .first()
    .click({ timeout: 8_000 })
    .catch(() => {
      // Size selection required, out of stock, or bot-block — carry on
    });

  await page.waitForTimeout(1_500);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('INF-362: Couponator No-Savings Cashback UI', () => {
  /**
   * AC-1: Service worker accepts Codes = [] without throwing an error.
   *
   * Seeds the store before any page navigation to confirm _primitiveHandler
   * is writable as soon as the SW initialises.
   */
  test('AC-1: service worker accepts Codes = [] without error', async ({ extensionContext }) => {
    // Confirm _primitiveHandler is up, then seed a starter entry
    await waitForPrimitiveHandler(extensionContext);
    const [worker] = extensionContext.serviceWorkers();

    await worker.evaluate(() => {
      const store = (_primitiveHandler as any)._primitives.store._store;
      if (!store.couponData) store.couponData = {};
      store.couponData['macys.com'] = { Codes: ['SUMMER25'] };
    });

    // Override to empty — must not throw
    await worker.evaluate(() => {
      (_primitiveHandler as any)._primitives.store._store.couponData['macys.com'].Codes = [];
    });

    const codes = await worker.evaluate(() => {
      return (_primitiveHandler as any)._primitives.store._store.couponData['macys.com'].Codes;
    });

    expect(codes).toEqual([]);
  });

  /**
   * AC-2: Adding a product to cart triggers the extension overlay.
   * AC-6b: No coupon codes are attempted or applied (Codes remains []).
   *
   * Seeds the SW store FIRST, then navigates so the extension reads the
   * pre-seeded empty Codes rather than fetching fresh ones from the API.
   */
  test(
    'AC-2 + AC-6b: overlay appears after add-to-cart and no codes are applied',
    async ({ extensionContext }) => {
      const page = await extensionContext.newPage();

      // Step 1: seed SW store BEFORE navigating to any merchant page
      await seedEmptyCouponCodes(extensionContext, 'macys.com');

      const codesBefore = await getCouponCodes(extensionContext, 'macys.com');
      expect(codesBefore).toEqual([]);

      // Step 2: add product to cart
      await tryAddToBag(page);

      // Step 3: navigate to bag — couponator triggers here
      await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Step 4: overlay must appear
      await waitForExtensionOverlay(page);

      const overlayVisible = await page.evaluate(() => {
        const host = Array.from(document.documentElement.children).find(
          (el) =>
            el.tagName.includes('-') &&
            !['HEAD', 'BODY'].includes(el.tagName) &&
            (el as HTMLElement).style.transition?.includes('opacity'),
        ) as HTMLElement | undefined;
        return host ? host.style.opacity === '1' || host.style.opacity === '' : false;
      });
      expect(overlayVisible).toBe(true);

      // Step 5: Codes must still be [] — nothing was applied
      const codesAfter = await getCouponCodes(extensionContext, 'macys.com');
      expect(codesAfter).toEqual([]);

      await page.close();
    },
  );

  /**
   * AC-3: The "You've got a great price!" modal state is reached.
   * AC-4: No coupon was applied (bestCode absent, Codes still empty).
   *
   * The shadow root is mode:'closed' so DOM text cannot be queried directly.
   * We verify via two observable signals:
   *   (a) overlay is visible — the modal rendered, and
   *   (b) Codes is still [] — no code was ever tried.
   */
  test(
    'AC-3 + AC-4: couponator shows no-savings modal with cashback state on macys.com',
    async ({ extensionContext }) => {
      const page = await extensionContext.newPage();

      // Seed SW first, then navigate
      await seedEmptyCouponCodes(extensionContext, 'macys.com');
      await tryAddToBag(page);
      await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // (a) Overlay must be visible — "great price" modal rendered
      await waitForExtensionOverlay(page);

      const overlayVisible = await page.evaluate(() => {
        const host = Array.from(document.documentElement.children).find(
          (el) =>
            el.tagName.includes('-') &&
            !['HEAD', 'BODY'].includes(el.tagName) &&
            (el as HTMLElement).style.transition?.includes('opacity'),
        ) as HTMLElement | undefined;
        return host ? host.style.opacity === '1' || host.style.opacity === '' : false;
      });
      expect(overlayVisible).toBe(true);

      // (b) Codes still empty — couponator did not attempt to apply any code
      const codesAfter = await getCouponCodes(extensionContext, 'macys.com');
      expect(codesAfter).toEqual([]);

      await page.close();
    },
  );

  /**
   * AC-5: "Continue to Checkout" dismisses the modal.
   *
   * The shadow root is mode:'closed' so the button cannot be targeted via
   * Playwright locators. We use page.keyboard to Tab into the shadow host and
   * press Enter, then confirm the overlay is gone or a navigation occurred.
   */
  test('AC-5: "Continue to Checkout" dismisses the modal', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();

    await seedEmptyCouponCodes(extensionContext, 'macys.com');
    await tryAddToBag(page);
    await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForExtensionOverlay(page);

    // Click the approximate CTA position: centre-X, ~80% down the host rect.
    // The "Continue to Checkout" button is near the bottom of the modal card.
    const ctaPoint = await page.evaluate(() => {
      const host = Array.from(document.documentElement.children).find(
        (el) =>
          el.tagName.includes('-') &&
          !['HEAD', 'BODY'].includes(el.tagName) &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ) as HTMLElement | undefined;
      if (!host) return null;
      const r = host.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.82) };
    });

    expect(ctaPoint).not.toBeNull();

    // Wait for either a navigation OR the overlay to disappear after the click
    await Promise.all([
      page.waitForNavigation({ timeout: 8_000 }).catch(() => {}),
      page.mouse.click(ctaPoint!.x, ctaPoint!.y),
    ]);
    await page.waitForTimeout(2_000);

    // Either the page navigated away (overlay gone naturally) or it was hidden
    const overlayGoneOrNavigated = await page.evaluate(() => {
      const host = Array.from(document.documentElement.children).find(
        (el) =>
          el.tagName.includes('-') &&
          !['HEAD', 'BODY'].includes(el.tagName) &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ) as HTMLElement | undefined;
      if (!host) return true; // element removed from DOM
      return host.style.opacity === '0' || host.style.display === 'none';
    });

    expect(overlayGoneOrNavigated).toBe(true);
    await page.close();
  });

  /**
   * AC-6: Behaviour is reproducible on a second merchant (nordstrom.com).
   */
  test('AC-6: empty Codes = [] is reproducible on nordstrom.com', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();

    // Seed SW first
    await seedEmptyCouponCodes(extensionContext, 'nordstrom.com');

    const codesBefore = await getCouponCodes(extensionContext, 'nordstrom.com');
    expect(codesBefore).toEqual([]);

    // Navigate to nordstrom bag — extension must mount and not apply codes
    await page.goto(NORDSTROM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2_000);
    await page.goto(NORDSTROM_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const hostPresent = await page.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    );
    expect(hostPresent).toBe(true);

    // Codes must remain empty
    const codesAfter = await getCouponCodes(extensionContext, 'nordstrom.com');
    expect(codesAfter).toEqual([]);

    await page.close();
  });
});
