import { test, expect, chromium } from '@playwright/test';
import {
  fixtureUrl,
  ensureDisplay,
  waitForPage,
} from './helpers.js';
import path from 'path';

const extensionPath = path.resolve('output/chrome-mv3');

// Currently skipped because the undock approach is not working and I can't
// "click" the Hotwire Inspector tab in the docked DevTools window since it's
// behind the More tabs button.
test.skip('interacts with DevTools panel directly via undock approach', async ({ browserName }) => {
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

    const start = Date.now();

    while (
      Date.now() - start < 10000
      && !devtools.frames().some((frame) => frame.url().startsWith('chrome-extension'))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!devtools.frames().some((frame) => frame.url().startsWith('chrome-extension'))) {
      throw new Error('Timed out waiting for extension frame in DevTools');
    }

    // List all visible tabs for debugging
    console.log('Frames:', devtools.frames().map((f) => f.url()));
    const tabs = await devtools.getByRole('tab').allTextContents();
    console.log('Available tabs:', JSON.stringify(tabs));

    // Click on Console tab first to ensure devtools are loaded
    const consoleTab = devtools.getByRole('tab', { name: 'Console' });
    await consoleTab.click();
    console.log('Clicked Console tab');
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // This fails to find the buttons but if undocking worked it would be easier to
    // click the Hotwire Inspector tab
    await devtools.getByRole('button', { name: 'Customize and control DevTools' }).click();
    await devtools.getByRole('button', { name: 'Undock into separate window' }).click();

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
        // Currently this opens the menu but the next line doesn't see the entries
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
