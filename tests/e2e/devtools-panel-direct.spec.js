import { test, expect, chromium } from '@playwright/test';
import {
  fixtureUrl,
  ensureDisplay,
  waitForPage,
} from './helpers.js';
import path from 'path';

const extensionPath = path.resolve('output/chrome-mv3');

test('interacts with DevTools panel directly via undock approach', async ({ browserName }) => {
  test.skip(browserName !== 'chromium');
  test.setTimeout(60000);

  const xvfb = await ensureDisplay();
  const userDataDir = path.join('/tmp', `hotwire-inspector-undock-${Date.now()}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--auto-open-devtools-for-tabs',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const devtools = await waitForPage(
      context,
      (p) => p.url().includes('devtools://'),
    );

    const page = context.pages().find((p) => p.url() === 'about:blank')
      ?? await context.newPage();

    // Wait for DevTools to fully load
    await new Promise((r) => setTimeout(r, 3000));

    // List all visible tabs for debugging
    console.log('Frames:', devtools.frames().map((f) => f.url()));
    const tabs = await devtools.getByRole('tab').allTextContents();
    console.log('Available tabs:', JSON.stringify(tabs));

    // Try to find and click the Hotwire Inspector tab without undocking
    const hwTab = devtools.getByRole('tab', { name: 'Hotwire Inspector' });
    const hwTabCount = await hwTab.count();
    console.log('Hotwire Inspector tab count:', hwTabCount);

    if (hwTabCount === 0) {
      // Check if it's in the "More tabs" overflow
      const moreTabs = devtools.getByRole('button', { name: 'More tabs' });
      const moreCount = await moreTabs.count();
      console.log('More tabs button count:', moreCount);

      if (moreCount > 0) {
        await moreTabs.click();
        await new Promise((r) => setTimeout(r, 500));
        const overflowTabs = await devtools.getByRole('menuitem').allTextContents();
        console.log('Overflow menu items:', JSON.stringify(overflowTabs));
      }

      throw new Error('Hotwire Inspector tab not found in DevTools');
    }

    await hwTab.click({ timeout: 10000 });
    console.log('Clicked Hotwire Inspector tab');

    // Access the panel iframe
    const devtoolsPanel = devtools.frameLocator('iframe[src*="panel.html"]');

    // Navigate to the fixture page
    await page.goto(fixtureUrl);

    // Wait for the panel to render scan results
    await expect(devtoolsPanel.locator('#summary')).toHaveText(/\d+ frames?, \d+ controllers?/, { timeout: 5000 });

    // Verify panel rendered the tree
    const nodeIds = await devtoolsPanel.locator('.node-id').allTextContents();
    expect(nodeIds).toContain('main-frame');
    expect(nodeIds).toContain('nested-frame');
  } finally {
    await context.close();

    if (xvfb?.pid) {
      try { process.kill(-xvfb.pid, 'SIGTERM'); } catch { }
      delete process.env.DISPLAY;
    }
  }
});
