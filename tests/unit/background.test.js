import { afterEach, describe, it, expect, vi } from "vitest";
import { handleTabUpdated } from "../../lib/background-handler.js";
import {
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  PANEL_EVENTS_PORT_NAME_PREFIX,
  TREE_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";
import { createFakeExtensionPort } from "./helpers/port.js";

function createFakePort() {
  return {
    postMessage: vi.fn(),
  };
}

describe("handleTabUpdated", () => {
  it("sends a tree-changed push when the tab finishes loading", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 1, { status: "complete" });

    expect(port.postMessage).toHaveBeenCalledWith({
      type: TREE_CHANGED_PUSH_TYPE,
    });
  });

  it("does not send a push for tabs without an open panel", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 2, { status: "complete" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("does not send a push while the tab is still loading", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 1, { status: "loading" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });
});

const { fakeBrowser } = vi.hoisted(() => {
  const listeners = { connect: [], message: [], tabUpdated: [] };
  return {
    fakeBrowser: {
      _listeners: listeners,
      runtime: {
        onConnect: { addListener: (cb) => listeners.connect.push(cb) },
        onMessage: { addListener: (cb) => listeners.message.push(cb) },
      },
      tabs: {
        onUpdated: { addListener: (cb) => listeners.tabUpdated.push(cb) },
        sendMessage: vi.fn(() => Promise.resolve({})),
      },
    },
  };
});

vi.mock("wxt/browser", () => ({ browser: fakeBrowser }));

describe("background entrypoint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fakeBrowser._listeners.connect.length = 0;
    fakeBrowser._listeners.message.length = 0;
    fakeBrowser._listeners.tabUpdated.length = 0;
    fakeBrowser.tabs.sendMessage.mockClear();
    vi.resetModules();
  });

  it("keeps routing pushes to the newest panel port when an older port for the same tab disconnects late", async () => {
    vi.stubGlobal("defineBackground", (setup) => setup());
    await import("../../entrypoints/background.js");

    const tabId = 7;
    const oldPort = createFakeExtensionPort({
      name: PANEL_EVENTS_PORT_NAME_PREFIX + tabId,
    });
    const newPort = createFakeExtensionPort({
      name: PANEL_EVENTS_PORT_NAME_PREFIX + tabId,
    });

    fakeBrowser._listeners.connect[0](oldPort);
    fakeBrowser._listeners.connect[0](newPort);

    oldPort._listeners.disconnect.forEach((cb) => cb());

    fakeBrowser._listeners.tabUpdated.forEach((cb) =>
      cb(tabId, { status: "complete" }),
    );

    expect(newPort.postMessage).toHaveBeenCalledWith({
      type: TREE_CHANGED_PUSH_TYPE,
    });
  });

  it("does not send an unwatch message when a replaced panel port disconnects late", async () => {
    vi.stubGlobal("defineBackground", (setup) => setup());
    await import("../../entrypoints/background.js");

    const tabId = 7;
    const oldPort = createFakeExtensionPort({
      name: PANEL_EVENTS_PORT_NAME_PREFIX + tabId,
    });
    const newPort = createFakeExtensionPort({
      name: PANEL_EVENTS_PORT_NAME_PREFIX + tabId,
    });

    fakeBrowser._listeners.connect[0](oldPort);
    fakeBrowser._listeners.connect[0](newPort);

    oldPort._listeners.disconnect.forEach((cb) => cb());

    expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalledWith(tabId, {
      type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
    });
  });
});
