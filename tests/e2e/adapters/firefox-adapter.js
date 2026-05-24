import path from 'path';
import { addMockPanelApis } from '../support/panel-assertions.js';
import { withStaticServer } from '../support/static-server.js';

export const firefoxAdapter = {
  browserName: 'firefox',
  extensionOutputPath: path.resolve('output/firefox-mv2'),
  extensionUrlScheme: 'moz-extension://',
  capabilities: {
    loadsExtension: false,
    opensDevtoolsPanel: false,
    supportsContentScriptMessaging: false,
    supportsDirectPanelPage: true,
    usesMockedPanelApis: true,
  },
  withExtension,
  openPanelPage,
  withPanelPage,
  sendToContentScript,
};

async function withExtension() {
  throw new Error('Firefox extension loading is not supported by the E2E adapter yet');
}

export async function openPanelPage(page, options = {}) {
  await addMockPanelApis(page, options);

  let panelPage;

  await withStaticServer(firefoxAdapter.extensionOutputPath, async (baseUrl) => {
    panelPage = page;
    await panelPage.goto(`${baseUrl}/panel.html`);
    await panelPage.waitForLoadState('networkidle');
  });

  return panelPage;
}

export async function withPanelPage(page, options = {}, testBody) {
  await addMockPanelApis(page, options);

  await withStaticServer(firefoxAdapter.extensionOutputPath, async (baseUrl) => {
    await page.goto(`${baseUrl}/panel.html`);
    await page.waitForLoadState('networkidle');
    await testBody(page);
  });
}

async function sendToContentScript() {
  throw new Error('Firefox content-script messaging is not supported by the E2E adapter yet');
}
