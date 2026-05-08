import { test, expect } from '@playwright/test';
import {
  withChromiumExtension,
  getExtensionDevtoolsFrame,
  getExtensionId,
} from './helpers.js';
import { ID_PREFIX } from '../../lib/constants.js';

const fixtureScanResponse = {
  items: [
    { id: 'main-frame', src: '/main', parentId: null, type: 'frame', controllers: [] },
    { id: 'nested-frame', src: null, parentId: 'main-frame', type: 'frame', controllers: [] },
    { id: 'modal-controller', parentId: 'nested-frame', type: 'controller', controllers: ['modal', 'dropdown'] },
    { id: 'sidebar-controller', parentId: null, type: 'controller', controllers: ['sidebar'] },
  ],
};

const deepScanResponse = {
  items: [
    { id: 'level-1', src: null, parentId: null, type: 'frame', controllers: [] },
    { id: 'level-2', src: null, parentId: 'level-1', type: 'frame', controllers: [] },
    { id: 'level-3', parentId: 'level-2', type: 'controller', controllers: ['modal'] },
    { id: 'level-4', src: null, parentId: 'level-3', type: 'frame', controllers: [] },
    { id: 'level-5', parentId: 'level-4', type: 'controller', controllers: ['dropdown'] },
    { id: 'level-6', src: null, parentId: 'level-5', type: 'frame', controllers: [] },
    { id: 'level-7', parentId: 'level-6', type: 'controller', controllers: ['sidebar'] },
  ],
};

async function openPanelPage(context, { scanResponse, scanError, scanResponses } = {}) {
  const frame = await getExtensionDevtoolsFrame(context);
  const extensionId = getExtensionId(frame);
  const panelUrl = `chrome-extension://${extensionId}/panel.html`;

  const panelPage = await context.newPage();

  await panelPage.addInitScript(({ scanResponse, scanError, scanResponses }) => {
    window.__hotwireInspectorMessages = [];
    window.__hotwireInspectorEvalCalls = [];

    chrome.devtools = {
      inspectedWindow: {
        tabId: 1,
        eval: (code) => {
          window.__hotwireInspectorEvalCalls.push(code);
        },
      },
    };

    let scanCallCount = 0;

    chrome.tabs.sendMessage = (_tabId, message) => {
      window.__hotwireInspectorMessages.push(message);

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

async function getRecordedMessages(panelPage) {
  return panelPage.evaluate(() => window.__hotwireInspectorMessages);
}

async function getRecordedEvalCalls(panelPage) {
  return panelPage.evaluate(() => window.__hotwireInspectorEvalCalls);
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

  test('does not render internal generated IDs', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, {
        scanResponse: {
          items: [
            { id: `${ID_PREFIX}-uuid-1`, parentId: null, type: 'controller', controllers: ['modal'] },
            { id: 'user-controller', parentId: null, type: 'controller', controllers: ['menu'] },
          ],
        },
      });

      const nodeIds = await panelPage.locator('.node-id').allTextContents();
      expect(nodeIds).not.toContain(`${ID_PREFIX}-uuid-1`);
      expect(nodeIds).toContain('user-controller');
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

  test('renders deeply nested tree structure', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: deepScanResponse });

      await expect(panelPage.locator('#summary')).toHaveText('4 frames, 3 controllers');
      await expect(panelPage.locator('.node-id')).toHaveText([
        'level-1',
        'level-2',
        'level-3',
        'level-4',
        'level-5',
        'level-6',
        'level-7',
      ]);

      let children = panelPage.locator('.node').filter({ hasText: 'level-1' }).first().locator('> .node-children');

      for (const levelId of ['level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7']) {
        await expect(children).not.toBeHidden();
        await expect(children.locator('> .node > .node-row .node-id').first()).toHaveText(levelId);
        children = children.locator('> .node').first().locator('> .node-children');
      }
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

  test('hovering and leaving a row sends highlight messages', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });
      const mainFrameRow = panelPage.locator('.node-row').filter({ hasText: 'main-frame' }).first();

      await mainFrameRow.hover();
      await panelPage.locator('h1').hover();

      const messages = await getRecordedMessages(panelPage);

      expect(messages).toEqual([
        { type: 'hotwire-inspector:scan' },
        { type: 'hotwire-inspector:highlight', id: 'main-frame' },
        { type: 'hotwire-inspector:clear-highlight' },
      ]);
    });
  });

  test('clicking a row inspects the selected element', async ({ browserName }) => {
    test.skip(browserName !== 'chromium');

    await withChromiumExtension(async ({ context }) => {
      const panelPage = await openPanelPage(context, { scanResponse: fixtureScanResponse });
      const nestedFrameRow = panelPage.locator('.node-row').filter({ hasText: 'nested-frame' }).first();

      await nestedFrameRow.dispatchEvent('click');

      const messages = await getRecordedMessages(panelPage);
      const evalCalls = await getRecordedEvalCalls(panelPage);

      expect(messages).toEqual([
        { type: 'hotwire-inspector:scan' },
        { type: 'hotwire-inspector:inspect', id: 'nested-frame' },
      ]);
      expect(evalCalls).toEqual([
        'inspect(document.querySelector("#mock"))',
      ]);
    });
  });
});
