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

export function withExpectedHeadingAndSummary(heading, summary) {
  return async (panelPage) => {
    await expect(panelPage.locator('h1')).toHaveText(heading);
    await expect(panelPage.locator('#summary')).toHaveText(summary);
  };
}

export function withExpectedNodeIds(expectedIds) {
  return async (panelPage) => {
    await expect(panelPage.locator('.node-id')).toHaveText(expectedIds);
  };
}

export function withExpectedTagNames(expectedTagNames) {
  return async (panelPage) => {
    const nodeKinds = await panelPage.locator('.node-kind').allTextContents();
    expect(nodeKinds).toEqual(expectedTagNames);
  };
}

export function withExpectedInternalIdsHidden(internalIdPrefix, visibleId) {
  return async (panelPage) => {
    const nodeIds = await panelPage.locator('.node-id').allTextContents();
    expect(nodeIds).not.toContain(`${internalIdPrefix}-uuid-1`);
    expect(nodeIds).toContain(visibleId);
  };
}

export function withExpectedFrameSrc(nodeId, expectedSrc) {
  return async (panelPage) => {
    const nodeRow = panelPage.locator('.node-row').filter({ hasText: nodeId }).first();
    const src = nodeRow.locator('.node-src');

    await expect(src).toBeVisible();
    await expect(src).toHaveText(expectedSrc);
  };
}

export function withExpectedControllerBadges(nodeId, expectedBadges) {
  return async (panelPage) => {
    const nodeRow = panelPage.locator('.node-row').filter({ hasText: nodeId }).first();
    const badges = await nodeRow.locator('.badge').allTextContents();

    expect(badges).toEqual(expectedBadges);
  };
}

export function withExpectedNestedTree(parentId, childId, grandchildId) {
  return async (panelPage) => {
    const parentChildren = panelPage.locator('.node').filter({ hasText: parentId }).first().locator('> .node-children');
    await expect(parentChildren).not.toBeHidden();
    await expect(parentChildren.locator('.node-id').first()).toHaveText(childId);

    const childChildren = parentChildren.locator('.node').filter({ hasText: childId }).first().locator('> .node-children');
    await expect(childChildren.locator('.node-id').first()).toHaveText(grandchildId);
  };
}

export function withExpectedDeepTree(summaryText, levelIds) {
  return async (panelPage) => {
    await expect(panelPage.locator('#summary')).toHaveText(summaryText);
    await expect(panelPage.locator('.node-id')).toHaveText(levelIds);

    let children = panelPage.locator('.node').filter({ hasText: levelIds[0] }).first().locator('> .node-children');

    for (let i = 1; i < levelIds.length; i++) {
      await expect(children).not.toBeHidden();
      await expect(children.locator('> .node > .node-row .node-id').first()).toHaveText(levelIds[i]);
      children = children.locator('> .node').first().locator('> .node-children');
    }
  };
}

export function withExpectedEmptyState(summaryText) {
  return async (panelPage) => {
    await expect(panelPage.locator('#empty-state')).toBeVisible();
    await expect(panelPage.locator('#tree')).toBeHidden();
    await expect(panelPage.locator('#summary')).toHaveText(summaryText);
  };
}

export function withExpectedErrorState(errorMessage) {
  return async (panelPage) => {
    await expect(panelPage.locator('#summary')).toHaveText(errorMessage);
  };
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

export function withExpectedPersistedTheme(expectedTheme) {
  return async (panelPage) => {
    await expect(panelPage.locator('#theme-select')).toHaveValue(expectedTheme);
    await expect(panelPage.locator('html')).toHaveAttribute('data-theme', expectedTheme);
  };
}

export function withExpectedHoverMessages(nodeId, expectedMessages) {
  return async (panelPage) => {
    const nodeRow = panelPage.locator('.node-row').filter({ hasText: nodeId }).first();

    await clearRecordedMessages(panelPage);
    await nodeRow.hover();
    await panelPage.locator('h1').hover();

    const messages = await getRecordedMessages(panelPage);

    expect(messages).toEqual(expectedMessages);
  };
}

export function withExpectedClickInspects(nodeId, expectedMessages, expectedEvalCall) {
  return async (panelPage) => {
    const nodeRow = panelPage.locator('.node-row').filter({ hasText: nodeId }).first();
    const inspectIcon = nodeRow.locator('.icon-btn');

    await clearRecordedMessages(panelPage);
    await inspectIcon.click();

    const messages = await getRecordedMessages(panelPage);
    const evalCalls = await getRecordedEvalCalls(panelPage);

    expect(messages).toEqual(expectedMessages);
    expect(evalCalls).toEqual(expectedEvalCall);
  };
}

export async function expectDoubleClickTogglesNodeChildren(panelPage) {
  const mainFrameNode = panelPage.locator('.node').filter({ hasText: 'main-frame' }).first();
  const mainFrameRow = mainFrameNode.locator('> .node-row');
  const mainFrameChildren = mainFrameNode.locator('> .node-children');

  // Initial state: children are visible (expanded by default)
  await expect(mainFrameChildren).not.toBeHidden();

  // Double-click to collapse
  await mainFrameRow.dblclick();
  await expect(mainFrameChildren).toBeHidden();

  // Double-click again to expand
  await mainFrameRow.dblclick();
  await expect(mainFrameChildren).not.toBeHidden();
}
