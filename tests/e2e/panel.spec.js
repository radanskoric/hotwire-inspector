import { test } from '@playwright/test';
import { chromiumAdapter } from './adapters/chromium-adapter.js';
import { firefoxAdapter } from './adapters/firefox-adapter.js';
import {
  deepScanResponse,
  emptyScanResponse,
  fixtureScanResponse,
  internalIdScanResponse,
} from './support/panel-fixtures.js';
import {
  expectClickInspects,
  expectControllerBadges,
  expectDeepTree,
  expectDoubleClickTogglesNodeChildren,
  expectEmptyState,
  expectErrorState,
  expectFixtureNodeIds,
  expectFrameSrc,
  expectHeadingAndSummary,
  expectHoverMessages,
  expectInternalIdsHidden,
  expectNestedTree,
  expectPersistedTheme,
  expectRefreshRescans,
  expectThemeChanges,
  expectThemeSwitcher,
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

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectHeadingAndSummary);
  });

  test('renders tree nodes with correct IDs', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectFixtureNodeIds);
  });

  test('displays tag names for each node', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, withExpectedTagNames(['turbo-frame', 'turbo-frame', 'div', 'div']));
  });

  test('does not render internal generated IDs', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: internalIdScanResponse }, expectInternalIdsHidden);
  });

  test('shows frame src attribute', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectFrameSrc);
  });

  test('displays controller badges', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectControllerBadges);
  });

  test('renders nested tree structure', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectNestedTree);
  });

  test('renders deeply nested tree structure', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: deepScanResponse }, expectDeepTree);
  });

  test('shows empty state for no elements', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: emptyScanResponse }, expectEmptyState);
  });

  test('shows error state when scan fails', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanError: 'Connection failed' }, expectErrorState);
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

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse, persistedTheme: 'dark' }, expectPersistedTheme);
  });

  test('hovering and leaving a row sends highlight messages', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectHoverMessages);
  });

  test('clicking a row inspects the selected element', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectClickInspects);
  });

  test('double-clicking a row toggles node children visibility', async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(adapter, page, { scanResponse: fixtureScanResponse }, expectDoubleClickTogglesNodeChildren);
  });
});
