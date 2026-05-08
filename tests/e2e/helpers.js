import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';

export const fixtureUrl = `file://${path.resolve('tests/e2e/fixtures/test-page.html')}`;
export const deepFixtureUrl = `file://${path.resolve('tests/e2e/fixtures/deep-page.html')}`;
export const extensionPath = path.resolve('output/chrome-mv3');

const xvfbDisplay = ':99';

process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';

export async function ensureDisplay() {
  if (process.env.DISPLAY || process.platform !== 'linux') {
    return null;
  }

  const xvfb = spawn('Xvfb', [xvfbDisplay, '-screen', '0', '1280x720x24'], {
    detached: true,
    stdio: 'ignore',
  });

  xvfb.unref();
  process.env.DISPLAY = xvfbDisplay;

  await new Promise((resolve) => setTimeout(resolve, 500));

  return xvfb;
}

export async function waitForPage(context, predicate, timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    for (const candidate of context.pages()) {
      await candidate.waitForLoadState('domcontentloaded').catch(() => { });

      if (predicate(candidate)) {
        return candidate;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for a matching page');
}

export async function withChromiumExtension(testBody) {
  const userDataDir = path.join('/tmp', `hotwire-inspector-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const xvfb = await ensureDisplay();
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
    const page = context.pages().find((candidate) => candidate.url() === 'about:blank')
      ?? await context.newPage();

    await testBody({ context, page });
  } finally {
    await context.close();

    if (xvfb?.pid) {
      try { process.kill(-xvfb.pid, 'SIGTERM'); } catch { }
      delete process.env.DISPLAY;
    }
  }
}

export async function getExtensionDevtoolsFrame(context) {
  const devtools = await waitForPage(
    context,
    (candidate) => candidate.url().includes('devtools://'),
  );

  const start = Date.now();

  while (Date.now() - start < 10000) {
    const frame = devtools.frames().find(
      (f) => f.url().includes('chrome-extension://') && f.url().includes('/devtools.html'),
    );

    if (frame) {
      return frame;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Extension devtools frame not found');
}

export function getExtensionId(extensionFrame) {
  const match = extensionFrame.url().match(/chrome-extension:\/\/([^/]+)/);

  if (!match) {
    throw new Error('Could not extract extension ID from frame URL');
  }

  return match[1];
}

export async function sendToContentScript(extensionFrame, message) {
  return extensionFrame.evaluate(async (msg) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }, message);
}
