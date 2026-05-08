import { test, expect } from '@playwright/test';
import {
  fixtureUrl,
  withChromiumExtension,
  getExtensionDevtoolsFrame,
  sendToContentScript,
} from './helpers.js';

async function gotoFixture(page) {
  await page.goto(fixtureUrl);
}

test.describe('Content Script', () => {
  test('registers the DevTools panel', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);

      const hasDevtools = await frame.evaluate(() => typeof chrome?.devtools?.panels?.create === 'function');
      expect(hasDevtools).toBe(true);
    });
  });

  test('scans and displays turbo-frames', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: 'hotwire-inspector:scan' });

      const frames = result.items.filter((item) => item.type === 'frame');
      expect(frames).toHaveLength(2);
      expect(frames.map((f) => f.id)).toEqual(['main-frame', 'nested-frame']);
      expect(frames[0].src).toBe('/main');
      expect(frames[1].parentId).toBe('main-frame');
    });
  });

  test('scans and displays Stimulus controllers', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: 'hotwire-inspector:scan' });

      const controllers = result.items.filter((item) => item.type === 'controller');
      expect(controllers).toHaveLength(2);

      const multi = controllers.find((c) => c.controllers.includes('modal'));
      expect(multi.controllers).toEqual(['modal', 'dropdown']);
      expect(multi.parentId).toBe('nested-frame');

      const sidebar = controllers.find((c) => c.controllers.includes('sidebar'));
      expect(sidebar.parentId).toBeNull();
    });
  });

  test('highlights element on hover', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: 'hotwire-inspector:highlight', id: 'main-frame' });

      expect(result).toEqual({ success: true });

      const styles = await page.locator('#main-frame').evaluate((el) => ({
        outlineStyle: el.style.outlineStyle,
        outlineWidth: el.style.outlineWidth,
      }));
      expect(styles.outlineStyle).toBe('solid');
      expect(styles.outlineWidth).toBe('2px');
    });
  });

  test('removes highlight on mouse leave', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      await sendToContentScript(frame, { type: 'hotwire-inspector:highlight', id: 'main-frame' });
      await sendToContentScript(frame, { type: 'hotwire-inspector:clear-highlight' });

      const outlineStyle = await page.locator('#main-frame').evaluate((el) => el.style.outlineStyle);
      expect(outlineStyle).toBe('');
    });
  });

  test('inspect returns a valid selector', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: 'hotwire-inspector:inspect', id: 'main-frame' });

      expect(result.success).toBe(true);
      expect(result.selector).toBe('#main-frame');

      const found = await page.locator(result.selector).count();
      expect(found).toBe(1);
    });
  });

  test('handles empty page gracefully', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await page.goto('about:blank');

      const frame = await getExtensionDevtoolsFrame(context);

      await expect(
        sendToContentScript(frame, { type: 'hotwire-inspector:scan' }),
      ).rejects.toThrow();
    });
  });

  test('builds correct parent-child relationships', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: 'hotwire-inspector:scan' });

      const mainFrame = result.items.find((i) => i.id === 'main-frame');
      const nestedFrame = result.items.find((i) => i.id === 'nested-frame');
      const modalController = result.items.find((i) => i.controllers?.includes('modal'));
      const sidebarController = result.items.find((i) => i.controllers?.includes('sidebar'));

      expect(mainFrame.parentId).toBeNull();
      expect(nestedFrame.parentId).toBe('main-frame');
      expect(modalController.parentId).toBe('nested-frame');
      expect(sidebarController.parentId).toBeNull();
    });
  });
});
