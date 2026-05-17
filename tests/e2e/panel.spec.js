import { test } from '@playwright/test';
import { chromiumAdapter } from './adapters/chromium-adapter.js';
import { firefoxAdapter } from './adapters/firefox-adapter.js';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  ID_PREFIX,
} from '../../lib/constants.js';
import {
  deepScanResponse,
  emptyScanResponse,
  fixtureScanResponse,
  internalIdScanResponse,
} from './support/panel-fixtures.js';
import {
  expectDoubleClickTogglesNodeChildren,
  expectRefreshRescans,
  expectThemeChanges,
  expectThemeSwitcher,
  withExpectedClickInspects,
  withExpectedControllerBadges,
  withExpectedDeepTree,
  withExpectedEmptyState,
  withExpectedErrorState,
  withExpectedFrameSrc,
  withExpectedHeadingAndSummary,
  withExpectedHoverMessages,
  withExpectedInternalIdsHidden,
  withExpectedNestedTree,
  withExpectedNodeIds,
  withExpectedPersistedTheme,
  withExpectedTagNames,
} from './support/panel-assertions.js';

const adaptersByBrowserName = {
  chromium: chromiumAdapter,
  firefox: firefoxAdapter,
};

async function withPanel(adapter, page, options, testBody) {
  if (!adapter.capabilities.supportsDirectPanelPage) {
    test.skip(true, `${adapter.browserName} does not support direct panel-page tests`);
  }

  if (adapter.browserName === 'chromium') {
    await adapter.withExtension(async ({ context }) => {
      const panelPage = await adapter.openPanelPage(context, options);
      await testBody(panelPage);
    });
    return;
  }

  const panelPage = await adapter.openPanelPage(page, options);
  await testBody(panelPage);
}

test.describe('Panel UI', () => {
  test('renders heading and summary', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedHeadingAndSummary('Hotwire Inspector', '2 frames, 4 controllers'));
  });

  test('renders tree nodes with correct IDs', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedNodeIds(['main-frame', 'nested-frame', 'modal-controller', 'sidebar-controller']));
  });

  test('displays tag names for each node', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedTagNames(['turbo-frame', 'turbo-frame', 'div', 'div']));
  });

  test('does not render internal generated IDs', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: internalIdScanResponse }, withExpectedInternalIdsHidden(ID_PREFIX, 'user-controller'));
  });

  test('shows frame src attribute', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedFrameSrc('main-frame', '/main'));
  });

  test('displays controller badges', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, async (panelPage) => {
      await withExpectedControllerBadges('main-frame', ['sidebar'])(panelPage);
      await withExpectedControllerBadges('modal-controller', ['modal', 'dropdown'])(panelPage);
    });
  });

  test('renders nested tree structure', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedNestedTree('main-frame', 'nested-frame', 'modal-controller'));
  });

  test('renders deeply nested tree structure', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: deepScanResponse }, withExpectedDeepTree('4 frames, 3 controllers', ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7']));
  });

  test('shows empty state for no elements', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: emptyScanResponse }, withExpectedEmptyState('0 frames, 0 controllers'));
  });

  test('shows error state when scan fails', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanError: 'Connection failed' }, withExpectedErrorState('Unable to read the inspected page'));
  });

  test('refresh button triggers rescan', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponses: [emptyScanResponse, fixtureScanResponse] },
      expectRefreshRescans,
    );
  });

  test('renders the theme switcher next to refresh', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectThemeSwitcher);
  });

  test('updates the panel theme from the switcher', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectThemeChanges);
  });

  test('applies a persisted panel theme override', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse, persistedTheme: 'dark' }, withExpectedPersistedTheme('dark'));
  });

  test('hovering and leaving a row sends highlight messages', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedHoverMessages('main-frame', [
      { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'main-frame' },
      { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE },
    ]));
  });

  test('clicking a row inspects the selected element', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedClickInspects('nested-frame', [
      { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'nested-frame' },
      { type: CONTENT_INSPECT_MESSAGE_TYPE, id: 'nested-frame' },
    ], ['inspect(document.querySelector("#mock"))']));
  });

  test('double-clicking a row toggles node children visibility', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectDoubleClickTogglesNodeChildren);
  });
});
