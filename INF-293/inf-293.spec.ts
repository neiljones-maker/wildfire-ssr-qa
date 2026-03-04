import { test, expect } from '../fixtures';
import { BrowserContext, Page } from '@playwright/test';

/**
 * INF-293 — Belk Injection Point Fix
 *
 * Verifies that the extension custom element is attached to document.documentElement
 * (not document.body) so it survives SSR hydration on sites like Belk.com.
 */

const BELK_URL = 'https://www.belk.com';
const STANDARD_URL = 'https://www.macys.com';

async function waitForExtensionHost(page: Page, timeout = 15_000) {
  return page.waitForFunction(
    () =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    { timeout },
  );
}

test.describe('INF-293: Belk Injection Point Fix', () => {
  test('extension host element is a direct child of <html>, not <body>', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(STANDARD_URL, { waitUntil: 'domcontentloaded' });
    await waitForExtensionHost(page);

    const { attachedToHtml, attachedToBody } = await page.evaluate(() => {
      const htmlChildren = Array.from(document.documentElement.children);
      const bodyChildren = Array.from(document.body?.children ?? []);
      const isInHtml = htmlChildren.some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      );
      const isInBody = bodyChildren.some((el) => el.tagName.includes('-'));
      return { attachedToHtml: isInHtml, attachedToBody: isInBody };
    });

    expect(attachedToHtml).toBe(true);
    expect(attachedToBody).toBe(false);
    await page.close();
  });

  test('extension host survives programmatic body replacement (hydration simulation)', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(STANDARD_URL, { waitUntil: 'domcontentloaded' });
    await waitForExtensionHost(page);

    // Simulate what SSR hydration does: replace the body element entirely
    await page.evaluate(() => {
      const newBody = document.createElement('body');
      newBody.innerHTML = '<div id="__next"><p>Hydrated content</p></div>';
      document.documentElement.replaceChild(newBody, document.body);
    });

    const stillPresent = await page.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    );

    expect(stillPresent).toBe(true);
    await page.close();
  });

  test('Belk.com — extension is present after full page load', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(BELK_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    const hostPresent = await page.evaluate(() =>
      Array.from(document.documentElement.children).some(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ),
    );

    expect(hostPresent).toBe(true);
    await page.close();
  });

  test('Belk.com — extension host is NOT inside <body> after hydration', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(BELK_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    const isInBody = await page.evaluate(() => {
      const bodyChildren = Array.from(document.body?.children ?? []);
      return bodyChildren.some((el) => el.tagName.includes('-'));
    });

    expect(isInBody).toBe(false);
    await page.close();
  });

  test('fade-in completes on documentElement-attached host', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(STANDARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const hostEl = Array.from(document.documentElement.children).find(
          (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
        ) as HTMLElement | undefined;
        return hostEl && (hostEl.style.opacity === '1' || hostEl.style.opacity === '');
      },
      { timeout: 5_000 },
    );

    const opacity = await page.evaluate(() => {
      const hostEl = Array.from(document.documentElement.children).find(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      ) as HTMLElement | undefined;
      return hostEl?.style.opacity ?? null;
    });

    expect(['1', '']).toContain(opacity);
    await page.close();
  });

  test('no regression — extension loads normally on a standard merchant page', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(STANDARD_URL, { waitUntil: 'domcontentloaded' });
    await waitForExtensionHost(page);

    const tagName = await page.evaluate(() => {
      const hostEl = Array.from(document.documentElement.children).find(
        (el) => el.tagName.includes('-') && !['HEAD', 'BODY'].includes(el.tagName),
      );
      return hostEl?.tagName ?? null;
    });

    expect(tagName).not.toBeNull();
    expect(tagName).toContain('-');
    await page.close();
  });
});
