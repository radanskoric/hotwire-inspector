import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import { PANEL_EVENTS_PORT_NAME_PREFIX } from "../../../lib/constants.js";
import { addMockPanelApis } from "../support/panel-assertions.js";

export const extensionPath = path.resolve("output/chrome-mv3");

export const chromiumAdapter = {
  browserName: "chromium",
  extensionOutputPath: extensionPath,
  extensionUrlScheme: "chrome-extension://",
  capabilities: {
    loadsExtension: true,
    opensDevtoolsPanel: true,
    supportsContentScriptMessaging: true,
    supportsDirectPanelPage: true,
    usesMockedPanelApis: true,
  },
  withExtension: withChromiumExtension,
  openPanelPage,
  sendToContentScript,
};

const xvfbDisplay = ":99";

process.env.PW_CHROMIUM_ATTACH_TO_OTHER = "1";

export async function ensureDisplay() {
  if (process.env.DISPLAY || process.platform !== "linux") {
    return null;
  }

  const xvfb = spawn("Xvfb", [xvfbDisplay, "-screen", "0", "1280x720x24"], {
    detached: true,
    stdio: "ignore",
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
      await candidate.waitForLoadState("domcontentloaded").catch(() => {});

      if (predicate(candidate)) {
        return candidate;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for a matching page");
}

export async function withChromiumExtension(testBody) {
  const userDataDir = path.join(
    "/tmp",
    `hotwire-inspector-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const xvfb = await ensureDisplay();
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--auto-open-devtools-for-tabs",
      `--disable-extensions-except=${chromiumAdapter.extensionOutputPath}`,
      `--load-extension=${chromiumAdapter.extensionOutputPath}`,
    ],
  });

  try {
    const page =
      context.pages().find((candidate) => candidate.url() === "about:blank") ??
      (await context.newPage());

    await testBody({ context, page });
  } finally {
    await context.close();

    if (xvfb?.pid) {
      try {
        process.kill(-xvfb.pid, "SIGTERM");
      } catch {
        /* Xvfb already exited; nothing to clean up */
      }
      delete process.env.DISPLAY;
    }
  }
}

export async function getExtensionDevtoolsFrame(context) {
  const devtools = await waitForPage(context, (candidate) =>
    candidate.url().includes("devtools://"),
  );

  const start = Date.now();

  while (Date.now() - start < 10000) {
    const frame = devtools
      .frames()
      .find(
        (f) =>
          f.url().includes("chrome-extension://") &&
          f.url().includes("/devtools.html"),
      );

    if (frame) {
      return frame;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Extension devtools frame not found");
}

export function getExtensionId(extensionFrame) {
  const match = extensionFrame.url().match(/chrome-extension:\/\/([^/]+)/);

  if (!match) {
    throw new Error("Could not extract extension ID from frame URL");
  }

  return match[1];
}

export async function openPanelPage(context, options = {}) {
  const frame = await getExtensionDevtoolsFrame(context);
  const extensionId = getExtensionId(frame);
  const panelUrl = `${chromiumAdapter.extensionUrlScheme}${extensionId}/panel.html`;
  const panelPage = await context.newPage();

  await addMockPanelApis(panelPage, options);
  await panelPage.goto(panelUrl);
  // eslint-disable-next-line playwright/no-networkidle -- deliberate: wait for the extension panel page to fully settle before handing it to tests
  await panelPage.waitForLoadState("networkidle");

  return panelPage;
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

/**
 * @typedef {object} PanelMessagesListenerOptions
 * @property {string} [messagesGlobal] - window property name holding the
 *   array of received messages. Defaults to
 *   "__hotwireInspectorPanelPortMessages".
 * @property {string} [portGlobal] - window property name holding the open
 *   `runtime.Port` instance. Defaults to
 *   "__hotwireInspectorPanelPort".
 */

/**
 * @typedef {object} PanelMessagesListenerContext
 * @property {() => Promise<any[]>} readMessages - returns a snapshot of
 *   every message received on the panel port so far. Designed to be
 *   passed straight to `expect.poll`.
 */

/**
 * Connects a port from the extension devtools frame using the
 * `${PANEL_EVENTS_PORT_NAME_PREFIX}${tabId}` pattern, so the background
 * treats it as the inspected tab's panel events port and relays each
 * content-side push onto it. The test body receives a `readMessages`
 * function that returns a snapshot of every message received so far,
 * suitable for use with `expect.poll`.
 *
 * The port is disconnected and the listeners' frame globals are cleared
 * once the test body resolves, releasing the background's
 * `panelPortsByTab` mapping before the next test runs.
 *
 * `frame` is expected to be the extension's `devtools.html` iframe
 * inside Chrome DevTools, returned by {@link getExtensionDevtoolsFrame}.
 *
 * @param {import("@playwright/test").Frame} frame
 * @param {(context: PanelMessagesListenerContext) => Promise<void>} testBody
 * @param {PanelMessagesListenerOptions} [options]
 * @returns {Promise<void>}
 */
export async function withPanelMessagesListener(frame, testBody, options = {}) {
  const messagesGlobal =
    options.messagesGlobal ?? "__hotwireInspectorPanelPortMessages";
  const portGlobal = options.portGlobal ?? "__hotwireInspectorPanelPort";

  const tabId = await frame.evaluate(
    () => chrome.devtools.inspectedWindow.tabId,
  );
  const panelPortName = `${PANEL_EVENTS_PORT_NAME_PREFIX}${tabId}`;

  await frame.evaluate(
    ({ panelPortName, messagesGlobal, portGlobal }) =>
      new Promise((resolve) => {
        const port = chrome.runtime.connect({ name: panelPortName });
        /** @type {any[]} */
        const messages = [];
        port.onMessage.addListener((msg) => messages.push(msg));
        globalThis[messagesGlobal] = messages;
        globalThis[portGlobal] = port;
        resolve(null);
      }),
    { panelPortName, messagesGlobal, portGlobal },
  );

  try {
    await testBody({
      readMessages: () =>
        frame.evaluate(
          (key) => /** @type {any[]} */ (globalThis[key]),
          messagesGlobal,
        ),
    });
  } finally {
    await frame
      .evaluate(
        ({ messagesGlobal, portGlobal }) => {
          globalThis[portGlobal]?.disconnect();
          delete globalThis[messagesGlobal];
          delete globalThis[portGlobal];
        },
        { messagesGlobal, portGlobal },
      )
      .catch(() => {
        // The frame or globals may already be gone if the test's outer
        // `withChromiumExtension` fixture tore down before us.
      });
  }
}
