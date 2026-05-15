import { expect } from '@playwright/test';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  ID_PREFIX,
} from '../../../lib/constants.js';

export async function addMockPanelApis(page, { scanResponse, scanError, scanResponses, persistedTheme } = {}) {
  await page.addInitScript(({ scanResponse, scanError, scanResponses, persistedTheme, scanMessageType }) => {
    globalThis.browser ??= {};
    globalThis.browser.runtime ??= {};
    globalThis.chrome ??= globalThis.browser;
    globalThis.__hotwireInspectorMessages = [];
    globalThis.__hotwireInspectorEvalCalls = [];

    if (persistedTheme) {
      localStorage.setItem('hotwire-inspector.theme', persistedTheme);
    }

    browser.devtools = {
      inspectedWindow: {
        tabId: 1,
        eval: (code) => {
          globalThis.__hotwireInspectorEvalCalls.push(code);
        },
      },
    };

    let scanCallCount = 0;

    browser.runtime.sendMessage = (relayMessage) => {
      const message = relayMessage.message;

      globalThis.__hotwireInspectorMessages.push(message);

      if (message.type === scanMessageType) {
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
    globalThis.chrome = globalThis.browser;
  }, { scanResponse, scanError, scanResponses, persistedTheme, scanMessageType: CONTENT_SCAN_MESSAGE_TYPE });
}

export async function getRecordedMessages(panelPage) {
  return panelPage.evaluate(() => globalThis.__hotwireInspectorMessages);
}

export async function clearRecordedMessages(panelPage) {
  await panelPage.evaluate(() => {
    globalThis.__hotwireInspectorMessages = [];
  });
}

export async function getRecordedEvalCalls(panelPage) {
  return panelPage.evaluate(() => globalThis.__hotwireInspectorEvalCalls);
}

export async function expectHeadingAndSummary(panelPage) {
  await expect(panelPage.locator('h1')).toHaveText('Hotwire Inspector');
  await expect(panelPage.locator('#summary')).toHaveText('2 frames, 4 controllers');
}

export async function expectFixtureNodeIds(panelPage) {
  await expect(panelPage.locator('.node-id')).toHaveText(['main-frame', 'nested-frame', 'modal-controller', 'sidebar-controller']);
}

export async function expectInternalIdsHidden(panelPage) {
  const nodeIds = await panelPage.locator('.node-id').allTextContents();
  expect(nodeIds).not.toContain(`${ID_PREFIX}-uuid-1`);
  expect(nodeIds).toContain('user-controller');
}

export async function expectFrameSrc(panelPage) {
  const mainFrameRow = panelPage.locator('.node-row').filter({ hasText: 'main-frame' }).first();
  const src = mainFrameRow.locator('.node-src');

  await expect(src).toBeVisible();
  await expect(src).toHaveText('/main');
}

export async function expectControllerBadges(panelPage) {
  const mainFrameRow = panelPage.locator('.node-row').filter({ hasText: 'main-frame' }).first();
  const frameBadges = await mainFrameRow.locator('.badge').allTextContents();
  const modalRow = panelPage.locator('.node-row').filter({ hasText: 'modal-controller' }).first();
  const controllerBadges = await modalRow.locator('.badge').allTextContents();

  expect(frameBadges).toEqual(['sidebar']);
  expect(controllerBadges).toEqual(['modal', 'dropdown']);
}

export async function expectNestedTree(panelPage) {
  const mainFrameChildren = panelPage.locator('.node').filter({ hasText: 'main-frame' }).first().locator('> .node-children');
  await expect(mainFrameChildren).not.toBeHidden();
  await expect(mainFrameChildren.locator('.node-id').first()).toHaveText('nested-frame');

  const nestedChildren = mainFrameChildren.locator('.node').filter({ hasText: 'nested-frame' }).first().locator('> .node-children');
  await expect(nestedChildren.locator('.node-id').first()).toHaveText('modal-controller');
}

export async function expectDeepTree(panelPage) {
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
}

export async function expectEmptyState(panelPage) {
  await expect(panelPage.locator('#empty-state')).toBeVisible();
  await expect(panelPage.locator('#tree')).toBeHidden();
  await expect(panelPage.locator('#summary')).toHaveText('0 frames, 0 controllers');
}

export async function expectErrorState(panelPage) {
  await expect(panelPage.locator('#summary')).toHaveText('Unable to read the inspected page');
}

export async function expectRefreshRescans(panelPage) {
  await expect(panelPage.locator('#summary')).toHaveText('0 frames, 0 controllers');

  await panelPage.locator('#refresh-button').click();

  await expect(panelPage.locator('#summary')).toHaveText('2 frames, 4 controllers');
}

export async function expectThemeSwitcher(panelPage) {
  const actions = panelPage.locator('.toolbar-actions');
  const themeSelect = actions.locator('#theme-select');

  await expect(themeSelect).toBeVisible();
  await expect(themeSelect.locator('option')).toHaveText(['System', 'Light', 'Dark']);
  await expect(actions.locator('#refresh-button')).toBeVisible();
}

export async function expectThemeChanges(panelPage) {
  const themeSelect = panelPage.locator('#theme-select');

  await expect(themeSelect).toHaveValue('system');
  await expect(panelPage.locator('html')).not.toHaveAttribute('data-theme', /.+/);

  await themeSelect.selectOption('dark');
  await expect(panelPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(themeSelect).toHaveValue('dark');

  await themeSelect.selectOption('light');
  await expect(panelPage.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(themeSelect).toHaveValue('light');

  await themeSelect.selectOption('system');
  await expect(panelPage.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect(themeSelect).toHaveValue('system');
}

export async function expectPersistedTheme(panelPage) {
  await expect(panelPage.locator('#theme-select')).toHaveValue('dark');
  await expect(panelPage.locator('html')).toHaveAttribute('data-theme', 'dark');
}

export async function expectHoverMessages(panelPage) {
  const mainFrameRow = panelPage.locator('.node-row').filter({ hasText: 'main-frame' }).first();

  await clearRecordedMessages(panelPage);
  await mainFrameRow.hover();
  await panelPage.locator('h1').hover();

  const messages = await getRecordedMessages(panelPage);

  expect(messages).toEqual([
    { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'main-frame' },
    { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE },
  ]);
}

export async function expectClickInspects(panelPage) {
  const nestedFrameRow = panelPage.locator('.node-row').filter({ hasText: 'nested-frame' }).first();

  await clearRecordedMessages(panelPage);
  await nestedFrameRow.dispatchEvent('click');

  const messages = await getRecordedMessages(panelPage);
  const evalCalls = await getRecordedEvalCalls(panelPage);

  expect(messages).toEqual([
    { type: CONTENT_INSPECT_MESSAGE_TYPE, id: 'nested-frame' },
  ]);
  expect(evalCalls).toEqual([
    'inspect(document.querySelector("#mock"))',
  ]);
}
