import { test, expect } from '@playwright/test';
import {
  withChromiumExtension,
  getExtensionDevtoolsFrame,
  getExtensionId,
} from './helpers.js';

const fixtureScanResponse = {
  items: [
    { id: 'main-frame', src: '/main', parentId: null, type: 'frame', controllers: [] },
    { id: 'nested-frame', src: null, parentId: 'main-frame', type: 'frame', controllers: [] },
    { id: 'modal-controller', parentId: 'nested-frame', type: 'controller', controllers: ['modal', 'dropdown'] },
    { id: 'sidebar-controller', parentId: null, type: 'controller', controllers: ['sidebar'] },
  ],
};

async function openPanelPage(context, { scanResponse, scanError, scanResponses } = {}) {
  const frame = await getExtensionDevtoolsFrame(context);
  const extensionId = getExtensionId(frame);
  const panelUrl = `chrome-extension://${extensionId}/panel.html`;

  const panelPage = await context.newPage();

  await panelPage.addInitScript(({ scanResponse, scanError, scanResponses }) => {
    chrome.devtools = {
      inspectedWindow: {
        tabId: 1,
        eval: () => { },
      },
    };

    let scanCallCount = 0;

    chrome.tabs.sendMessage = (_tabId, message) => {
      if (message.type === 'hotwire-inspector:scan') {
        if (scanError) {
          return Promise.reject(new Error(scanError));
        }

        if (scanResponses) {
          const response = scanResponses[scanCallCount] ?? scanResponses[scanResponses.length - 1];
          scanCallCount++;
          return Promise.resolve(response);
        }

        return Promise.resolve(scanResponse);
      }

      return Promise.resolve({ success: true, selector: '#mock' });
    };
  }, { scanResponse, scanError, scanResponses });

  await panelPage.goto(panelUrl);
  await panelPage.waitForLoadState('networkidle');

  return panelPage;
}

test.describe('Panel UI', () => {
  test('renders heading and summary', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });

      await expect(panelPage.locator('h1')).toHaveText('Hotwire Inspector');
      await expect(panelPage.locator('#summary')).toHaveText('2 frames, 2 controllers');
    });
  });

  test('renders tree nodes with correct IDs', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });

      const nodeIds = await panelPage.locator('.node-id').allTextContents();
      expect(nodeIds).toEqual(['main-frame', 'nested-frame', 'modal-controller', 'sidebar-controller']);
    });
  });

  test('shows frame src attribute', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });

      const mainFrameRow = panelPage.locator('.node-row').filter({ hasText: 'main-frame' }).first();
      const src = mainFrameRow.locator('.node-src');

      await expect(src).toBeVisible();
      await expect(src).toHaveText('/main');
    });
  });

  test('displays controller badges', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });

      const modalNode = panelPage.locator('.node').filter({ hasText: 'modal-controller' }).first();
      const badges = await modalNode.locator('.badge').allTextContents();

      expect(badges).toEqual(['modal', 'dropdown']);
    });
  });

  test('renders nested tree structure', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });

      const mainFrameChildren = panelPage.locator('.node').filter({ hasText: 'main-frame' }).first().locator('> .node-children');
      await expect(mainFrameChildren).not.toBeHidden();
      await expect(mainFrameChildren.locator('.node-id').first()).toHaveText('nested-frame');

      const nestedChildren = mainFrameChildren.locator('.node').filter({ hasText: 'nested-frame' }).first().locator('> .node-children');
      await expect(nestedChildren.locator('.node-id').first()).toHaveText('modal-controller');
    });
  });

  test('shows empty state for no elements', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: { items: [] } });

      await expect(panelPage.locator('#empty-state')).toBeVisible();
      await expect(panelPage.locator('#tree')).toBeHidden();
      await expect(panelPage.locator('#summary')).toHaveText('0 frames, 0 controllers');
    });
  });

  test('shows error state when scan fails', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanError: 'Connection failed' });

      await expect(panelPage.locator('#summary')).toHaveText('Unable to read the inspected page');
    });
  });

  test('refresh button triggers rescan', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    const emptyResponse = { items: [] };

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, {
        scanResponses: [emptyResponse, fixtureScanResponse],
      });

      await expect(panelPage.locator('#summary')).toHaveText('0 frames, 0 controllers');

      await panelPage.locator('#refresh-button').click();

      await expect(panelPage.locator('#summary')).toHaveText('2 frames, 2 controllers');
    });
  });
});
