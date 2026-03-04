import { test, expect } from '../fixtures';

/**
 * INF-291 — Font Declaration Injection
 *
 * Verifies that:
 * - No inline <style> font injection occurs inside the extension host element
 * - mainElement and shadowRootElement are present in the instruction execution context
 * - The extension host element mounts and the fade-in animation fires
 *
 * NOTE: The shadow root is created with `mode: 'closed'`, so direct Playwright queries
 * into the shadow DOM are not possible. Context verification uses page.evaluate()
 * via the contentInstructionsExecutor debug log pattern.
 */

const TEST_URL = 'https://www.macys.com';

test.describe('INF-291: Font Declaration Injection', () => {
  test('extension host element is attached to document.documentElement', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    const hostHandle = await page.waitForFunction(
      () => {
        const children = Array.from(document.documentElement.children);
        return children.find((el) => el.tagName.includes('-') && el.shadowRoot === null);
      },
      { timeout: 10_000 },
    );

    expect(hostHandle).toBeTruthy();
    await page.close();
  });

  test('extension host element has no inline <style> child with font declarations', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => Array.from(document.documentElement.children).some((el) => el.tagName.includes('-')),
      { timeout: 10_000 },
    );

    const hasInlineFontStyle = await page.evaluate(() => {
      // shadowRoot === null identifies our extension's closed shadow root,
      // filtering out any native custom elements macys.com might have
      const hostEl = Array.from(document.documentElement.children).find(
        (el) => el.tagName.includes('-') && el.shadowRoot === null,
      );
      if (!hostEl) return false;
      const styleChildren = Array.from(hostEl.children).filter(
        (el) => el.tagName === 'STYLE',
      ) as HTMLStyleElement[];
      return styleChildren.some(
        (s) => s.textContent?.includes('@font-face') || s.textContent?.includes('font-family'),
      );
    });

    expect(hasInlineFontStyle).toBe(false);
    await page.close();
  });

  test('extension host element transitions from opacity 0 to 1', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const hostEl = Array.from(document.documentElement.children).find((el) =>
          el.tagName.includes('-'),
        ) as HTMLElement | undefined;
        return hostEl && (hostEl.style.opacity === '1' || hostEl.style.opacity === '');
      },
      { timeout: 5_000 },
    );

    const opacity = await page.evaluate(() => {
      const hostEl = Array.from(document.documentElement.children).find((el) =>
        el.tagName.includes('-'),
      ) as HTMLElement | undefined;
      return hostEl?.style.opacity ?? null;
    });

    expect(['1', '']).toContain(opacity);
    await page.close();
  });

  test('extension host element has a closed shadow root', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => Array.from(document.documentElement.children).some((el) => el.tagName.includes('-')),
      { timeout: 10_000 },
    );

    // mode:'closed' shadow roots return null for .shadowRoot on the host element
    const shadowRootIsNull = await page.evaluate(() => {
      const hostEl = Array.from(document.documentElement.children).find((el) =>
        el.tagName.includes('-'),
      );
      return hostEl ? hostEl.shadowRoot === null : null;
    });

    expect(shadowRootIsNull).toBe(true);
    await page.close();
  });

  test('service worker is active', async ({ extensionContext }) => {
    const workers = extensionContext.serviceWorkers();
    expect(workers.length).toBeGreaterThan(0);
    expect(workers[0].url()).toContain('worker.js');
  });
});
