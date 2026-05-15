import { test, expect } from '@playwright/test';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
} from '../../lib/constants.js';
import {
  deepFixtureUrl,
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
      const result = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });

      const frames = result.items.filter((item) => item.type === 'frame');
      expect(frames).toHaveLength(2);
      expect(frames.map((f) => f.id)).toEqual(['main-frame', 'nested-frame']);
      expect(frames[0].src).toBe('/main');
      expect(frames[0].controllers).toEqual(['sidebar']);
      expect(frames[1].parentId).toBe('main-frame');
    });
  });

  test('scans and displays Stimulus controllers', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });

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
      const result = await sendToContentScript(frame, { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'main-frame' });

      expect(result).toEqual({ success: true });

      await expect(page.locator('body > div')).toHaveCount(2);
      const overlay = page.locator('body > div').last();
      await expect(overlay).toHaveCSS('position', 'fixed');
      await expect(overlay).toHaveCSS('pointer-events', 'none');
      await expect(overlay).toHaveCSS('z-index', '2147483647');
      await expect(overlay).toHaveCSS('box-sizing', 'border-box');
      await expect(overlay).toHaveCSS('outline-style', 'dashed');

      const overlayBox = await overlay.boundingBox();
      const targetBox = await page.locator('#main-frame').boundingBox();
      expect(overlayBox).toEqual(targetBox);
    });
  });

  test('removes highlight on mouse leave', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      await sendToContentScript(frame, { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'main-frame' });
      await sendToContentScript(frame, { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE });

      await expect(page.locator('body > div')).toHaveCount(1);
    });
  });

  test('inspect returns a valid selector', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: CONTENT_INSPECT_MESSAGE_TYPE, id: 'main-frame' });

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
        sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE }),
      ).rejects.toThrow();
    });
  });

  test('builds correct parent-child relationships', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });

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

  test('rescans after dynamic DOM changes', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page);

      const frame = await getExtensionDevtoolsFrame(context);
      const initialResult = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });

      expect(initialResult.items.find((item) => item.id === 'dynamic-frame')).toBeUndefined();

      await page.locator('#nested-frame').evaluate((nestedFrame) => {
        const frameElement = document.createElement('turbo-frame');
        frameElement.id = 'dynamic-frame';

        const controllerElement = document.createElement('div');
        controllerElement.id = 'dynamic-controller';
        controllerElement.setAttribute('data-controller', 'dynamic');
        controllerElement.textContent = 'Dynamic content';

        frameElement.appendChild(controllerElement);
        nestedFrame.appendChild(frameElement);
      });

      const updatedResult = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });
      const dynamicFrame = updatedResult.items.find((item) => item.id === 'dynamic-frame');
      const dynamicController = updatedResult.items.find((item) => item.id === 'dynamic-controller');

      expect(dynamicFrame).toMatchObject({
        id: 'dynamic-frame',
        parentId: 'nested-frame',
        type: 'frame',
      });
      expect(dynamicController).toMatchObject({
        id: 'dynamic-controller',
        parentId: 'dynamic-frame',
        type: 'controller',
        controllers: ['dynamic'],
      });
    });
  });

  test('handles deeply nested elements', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ page, context }) => {
      await page.goto(deepFixtureUrl);

      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE });
      const parentIdsById = Object.fromEntries(result.items.map((item) => [item.id, item.parentId]));

      expect(result.items.map((item) => item.id)).toEqual([
        'level-1',
        'level-2',
        'level-3',
        'level-4',
        'level-5',
        'level-6',
        'level-7',
      ]);
      expect(parentIdsById).toMatchObject({
        'level-1': null,
        'level-2': 'level-1',
        'level-3': 'level-2',
        'level-4': 'level-3',
        'level-5': 'level-4',
        'level-6': 'level-5',
        'level-7': 'level-6',
      });
    });
  });
});
