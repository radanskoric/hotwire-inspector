import { test, expect } from '@playwright/test';
import { firefoxAdapter } from './adapters/firefox-adapter.js';
import { fixtureScanResponse } from './support/panel-fixtures.js';

test.describe('Firefox smoke', () => {
  test('renders the built Firefox panel bundle with mocked extension APIs', async ({ browserName, page }) => {
    test.skip(browserName !== 'firefox');

    await firefoxAdapter.openPanelPage(page, { scanResponse: fixtureScanResponse });

    await expect(page.locator('h1')).toHaveText('Hotwire Inspector');
    await expect(page.locator('#summary')).toHaveText('2 frames, 2 controllers');
    await expect(page.locator('.node-id')).toHaveText(['main-frame', 'nested-frame', 'modal-controller', 'sidebar-controller']);
    await expect(page.locator('.badge')).toHaveText(['modal', 'dropdown', 'sidebar']);
  });
});
