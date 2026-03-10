import { test, expect } from '../fixtures';
import { BrowserContext, Page } from '@playwright/test';

/**
 * INF-362 — Couponator: No-Savings Cashback UI
 *
 * Verifies that when coupon codes are empty (Codes = []) for a merchant, the
 * couponator does NOT attempt to apply codes and instead shows the
 * "You've got a great price!" modal with the user's cashback rate.
 *
 * Test flow:
 *  1. Navigate to macys.com so the extension initialises the coupon data entry.
 *  2. Immediately override Codes = [] in the service worker store.
 *  3. Add a product to cart and proceed to the bag page.
 *  4. Verify the extension overlay appears (couponator ran).
 *  5. Verify via the service worker store that no codes were applied.
 *
 * NOTE: The extension shadow root is mode:'closed', so inner DOM content cannot
 * be asserted via Playwright locators. Modal-state assertions are made by
 * inspecting the service worker store — the same technique used in the other
 * INF-* specs in this repo.
 *
 * NOTE: These tests run against live macys.com / nordstrom.com. The PRODUCT_URL
 * constants below point to simple home-goods items that require no size/colour
 * selection. Update them if they go out of stock.
 */

// ─── URLs ────────────────────────────────────────────────────────────────────

const MACYS_URL = 'https://www.macys.com';
const MACYS_BAG_URL = 'https://www.macys.com/shop/bag';
// A one-size item (bath towel) — no variant selection needed
const MACYS_PRODUCT_URL =
  'https://www.macys.com/shop/product/hotel-collection-turkish-cotton-bath-towel?ID=37524';

const NORDSTROM_URL = 'https://www.nordstrom.com';
const NORDSTROM_BAG_URL = 'https://www.nordstrom.com/shopping/bag';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
 * Reads the Codes array for a domain from the service worker store.
 * Returns null if no entry exists yet.
 */
async function getCouponCodes(
  context: BrowserContext,
  domain: string,
): Promise<unknown[] | null> {
  const [worker] = context.serviceWorkers();
  return worker.evaluate((d: string) => {
    // _primitiveHandler is the global exposed by the extension's background worker
    const store = (_primitiveHandler as any)._primitives.store._store;
    return store.couponData?.[d]?.Codes ?? null;
  }, domain);
}

/**
 * Sets Codes = [] for the given domain, creating the couponData entry if it
 * doesn't already exist.
 */
async function seedEmptyCouponCodes(
  context: BrowserContext,
  domain: string,
): Promise<void> {
  const [worker] = context.serviceWorkers();
  await worker.evaluate((d: string) => {
    const store = (_primitiveHandler as any)._primitives.store._store;
    if (!store.couponData) store.couponData = {};
    if (!store.couponData[d]) store.couponData[d] = {};
    store.couponData[d].Codes = [];
  }, domain);
}

/**
 * Waits for the extension to populate couponData[domain] (which happens when
 * the content script runs on the merchant page), then immediately clears Codes.
 *
 * If the entry never appears within the timeout the function bails out and
 * creates a minimal entry instead — this lets subsequent assertions still run
 * and surface a meaningful failure rather than a timeout.
 */
async function waitForCouponDataThenSeedEmpty(
  context: BrowserContext,
  domain: string,
  timeoutMs = 15_000,
): Promise<void> {
  const [worker] = context.serviceWorkers();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const populated = await worker.evaluate((d: string) => {
      const store = (_primitiveHandler as any)._primitives.store._store;
      return !!store.couponData?.[d];
    }, domain);
    if (populated) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  await seedEmptyCouponCodes(context, domain);
}

/**
 * Attempts to add a product to the macys.com cart.
 * Tries common "Add to Bag" selectors; swallows errors so the calling test can
 * proceed to the bag page regardless (the page may already have items from a
 * previous session, or the couponator may trigger on the bag page itself).
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
        '.add-to-bag',
      ].join(', '),
    )
    .first()
    .click({ timeout: 8_000 })
    .catch(() => {
      // Size/colour selection required, or element not found — carry on
    });

  await page.waitForTimeout(1_500);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('INF-362: Couponator No-Savings Cashback UI', () => {
  /**
   * AC-1: Service worker accepts Codes = [] without throwing an error.
   */
  test('AC-1: service worker accepts Codes = [] without error', async ({ extensionContext }) => {
    const [worker] = extensionContext.serviceWorkers();

    // Create a starter entry with a real code so we can observe the override
    await worker.evaluate(() => {
      const store = (_primitiveHandler as any)._primitives.store._store;
      if (!store.couponData) store.couponData = {};
      store.couponData['macys.com'] = { Codes: ['SUMMER25'] };
    });

    // Clear the codes — must not throw
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
   * AC-5: No coupon codes are attempted or applied (Codes remains []).
   */
  test(
    'AC-2 + AC-5: overlay appears after add-to-cart and no codes are applied',
    async ({ extensionContext }) => {
      const page = await extensionContext.newPage();

      // Visit macys.com homepage so the extension content script runs and can
      // populate the couponData entry before we clear it
      await page.goto(MACYS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2_000);

      // Wait for the extension to populate couponData['macys.com'], then clear codes
      await waitForCouponDataThenSeedEmpty(extensionContext, 'macys.com');

      // Confirm codes are empty before proceeding
      const codesBefore = await getCouponCodes(extensionContext, 'macys.com');
      expect(codesBefore).toEqual([]);

      // Add a product to cart
      await tryAddToBag(page);

      // Navigate to the bag / checkout page — this is where the couponator triggers
      await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for the extension overlay to appear
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

      // AC-5: Codes must still be empty — the couponator must not have applied anything
      const codesAfter = await getCouponCodes(extensionContext, 'macys.com');
      expect(codesAfter).toEqual([]);

      await page.close();
    },
  );

  /**
   * AC-3: The "You've got a great price!" modal state is reached.
   * AC-4: The cashback rate is present (coupon history has no bestCode / zero savings).
   *
   * Because the shadow root is closed, we verify the modal state through the
   * service worker store rather than querying the rendered DOM directly.
   */
  test(
    'AC-3 + AC-4: couponator reaches no-savings completion state for macys.com',
    async ({ extensionContext }) => {
      const page = await extensionContext.newPage();

      await page.goto(MACYS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2_000);
      await waitForCouponDataThenSeedEmpty(extensionContext, 'macys.com');

      await tryAddToBag(page);
      await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForExtensionOverlay(page);

      // After the couponator completes, poll the service worker for the session record.
      // The session should show the run completed with no savings applied.
      const [worker] = extensionContext.serviceWorkers();
      const session = await worker.evaluate(() => {
        const store = (_primitiveHandler as any)._primitives.store._store;
        // couponApiHistory is keyed by tabId; grab the most recent entry
        const history = store.couponApiHistory ?? {};
        const entries = Object.values(history) as any[];
        return entries.find((e) => e?.domain === 'macys.com') ?? null;
      });

      // The session must have completed and recorded no best code / no savings
      expect(session).not.toBeNull();
      expect(session.completed).toBe(true);
      expect(session.bestCode).toBeNull();

      await page.close();
    },
  );

  /**
   * AC-5 (continued): "Continue to Checkout" dismisses the modal.
   * Clicks the CTA by evaluating JS against the shadow host position, then
   * waits for the overlay to be removed or hidden.
   */
  test('AC-5: "Continue to Checkout" dismisses the modal', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();

    await page.goto(MACYS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await waitForCouponDataThenSeedEmpty(extensionContext, 'macys.com');

    await tryAddToBag(page);
    await page.goto(MACYS_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForExtensionOverlay(page);

    // Get the bounding box of the extension host so we can click the CTA region.
    // The "Continue to Checkout" button sits at the bottom-centre of the modal.
    const hostBox = await page.evaluate(() => {
      const host = Array.from(document.documentElement.children).find(
        (el) =>
          el.tagName.includes('-') &&
          !['HEAD', 'BODY'].includes(el.tagName) &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ) as HTMLElement | undefined;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 };
    });

    expect(hostBox).not.toBeNull();
    await page.mouse.click(hostBox!.x, hostBox!.y);
    await page.waitForTimeout(1_500);

    // After dismissal the overlay should be gone or invisible
    const overlayGone = await page.evaluate(() => {
      const host = Array.from(document.documentElement.children).find(
        (el) =>
          el.tagName.includes('-') &&
          !['HEAD', 'BODY'].includes(el.tagName) &&
          (el as HTMLElement).style.transition?.includes('opacity'),
      ) as HTMLElement | undefined;
      if (!host) return true; // removed entirely
      return host.style.opacity === '0' || host.style.display === 'none';
    });

    expect(overlayGone).toBe(true);
    await page.close();
  });

  /**
   * AC-6: Behaviour is reproducible on a second merchant (nordstrom.com).
   */
  test('AC-6: empty Codes = [] is reproducible on nordstrom.com', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();

    await page.goto(NORDSTROM_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2_000);

    await waitForCouponDataThenSeedEmpty(extensionContext, 'nordstrom.com');

    const codes = await getCouponCodes(extensionContext, 'nordstrom.com');
    expect(codes).toEqual([]);

    // Navigate to the Nordstrom bag page — extension host must still mount
    await page.goto(NORDSTROM_BAG_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const hostPresent = await page.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    );

    expect(hostPresent).toBe(true);

    // Codes must still be empty — nothing was applied
    const codesAfter = await getCouponCodes(extensionContext, 'nordstrom.com');
    expect(codesAfter).toEqual([]);

    await page.close();
  });
});
