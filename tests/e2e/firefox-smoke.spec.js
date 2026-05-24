import { test, expect } from '@playwright/test';
import { firefoxAdapter } from './adapters/firefox-adapter.js';
import { fixtureScanResponse } from './support/panel-fixtures.js';

test.describe('Firefox smoke', () => {
  test('renders the built Firefox panel bundle with mocked extension APIs', async ({ browserName, page }) => {
    test.skip(browserName !== 'firefox');

    await firefoxAdapter.withPanelPage(page, { scanResponse: fixtureScanResponse }, async (panelPage) => {
      await expect(panelPage.locator('h1')).toHaveText('Hotwire Inspector');
      await expect(panelPage.locator('#summary')).toHaveText('2 frames, 4 controllers');
      await expect(panelPage.locator('.node-id')).toHaveText(['main-frame', 'nested-frame', 'modal-controller', 'sidebar-controller']);
      await expect(panelPage.locator('.badge')).toHaveText(['sidebar', 'modal', 'dropdown', 'sidebar']);
    });
  });
});
