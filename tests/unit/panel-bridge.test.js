import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
  PANEL_EVENTS_PORT_NAME_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
  TREE_CHANGED_PUSH_TYPE,
  TURBO_EVENT_PUSH_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";
import { PanelBridge } from "../../lib/panel-bridge.js";
import { createFakeExtensionPort } from "./helpers/port.js";

function createBrowserApi(
  sendMessageImplementation,
  evalResult = { success: true, name: "temp1" },
  connectImplementation,
) {
  const evalCalls = [];
  const connectCalls = [];
  let connectHandler = connectImplementation;
  return {
    runtime: {
      sendMessage: sendMessageImplementation,
      connect(options) {
        connectCalls.push(options);
        return connectHandler?.(options) ?? createFakeExtensionPort();
      },
    },
    devtools: {
      inspectedWindow: {
        tabId: 42,
        eval(code, callback) {
          evalCalls.push(code);
          callback?.(evalResult);
        },
      },
    },
    evalCalls,
    connectCalls,
    setConnectHandler(handler) {
      connectHandler = handler;
    },
  };
}

describe("PanelBridge", () => {
  it("uses provided browserApi and reads tabId", () => {
    const browserApi = createBrowserApi(() => Promise.resolve({}));
    const bridge = new PanelBridge({ browserApi });

    expect(bridge.browser).toBe(browserApi);
    expect(bridge.tabId).toBe(42);
  });

  it("sendToInspectedTab sends relay message with correct structure", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({ result: "ok" });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.sendToInspectedTab({
      type: "test",
      data: "value",
    });

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: { type: "test", data: "value" },
      },
    ]);
    expect(response).toEqual({ result: "ok" });
  });

  it("sendToInspectedTab throws error on RELAY_ERROR_TYPE response", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({
        type: RELAY_ERROR_TYPE,
        message: "relay failed",
      }),
    );
    const bridge = new PanelBridge({ browserApi });

    await expect(bridge.sendToInspectedTab({ type: "test" })).rejects.toThrow(
      "relay failed",
    );
  });

  it("inspectElementBySelector escapes backslashes and quotes", () => {
    const browserApi = createBrowserApi(() => Promise.resolve({}));
    const bridge = new PanelBridge({ browserApi });

    bridge.inspectElementBySelector('div[data-attr="value"]');
    bridge.inspectElementBySelector("div\\:with\\:backslashes");
    bridge.inspectElementBySelector('div[both\\"and\\\\"]');

    expect(browserApi.evalCalls).toEqual([
      'inspect(document.querySelector("div[data-attr=\\"value\\"]"))',
      'inspect(document.querySelector("div\\\\:with\\\\:backslashes"))',
      'inspect(document.querySelector("div[both\\\\\\"and\\\\\\\\\\"]"))',
    ]);
  });

  it("inspectNode sends CONTENT_INSPECT_MESSAGE_TYPE and calls inspectElementBySelector on success with selector", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      if (message.message?.type === CONTENT_INSPECT_MESSAGE_TYPE) {
        return Promise.resolve({ success: true, selector: "#frame-1" });
      }
      return Promise.resolve({ success: true });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.inspectNode("frame-1");

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: { type: CONTENT_INSPECT_MESSAGE_TYPE, id: "frame-1" },
      },
    ]);
    expect(browserApi.evalCalls).toEqual([
      'inspect(document.querySelector("#frame-1"))',
    ]);
    expect(response).toEqual({ success: true, selector: "#frame-1" });
  });

  it("inspectNode does not call inspectElementBySelector when response lacks success", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({ success: false, selector: "#frame-1" }),
    );
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.inspectNode("frame-1");

    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({ success: false, selector: "#frame-1" });
  });

  it("inspectNode does not call inspectElementBySelector when response lacks selector", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({ success: true, selector: null }),
    );
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.inspectNode("frame-1");

    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({ success: true, selector: null });
  });

  it("inspectNode resolves with the full response when no selector call is made", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({ success: false, selector: null }),
    );
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.inspectNode("missing");

    expect(response).toEqual({ success: false, selector: null });
  });

  it("storeControllerNode sends CONTENT_STORE_CONTROLLER_MESSAGE_TYPE to the content script", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({
        success: true,
        name: "temp3",
        identifier: "modal",
      });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.storeControllerNode(
      "modal-controller",
      "modal",
    );

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: {
          type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        },
      },
    ]);
    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({
      success: true,
      name: "temp3",
      identifier: "modal",
    });
  });

  it("controllerValues sends CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE to the content script", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({
        success: true,
        values: [
          {
            name: "title",
            type: "string",
            value: "Hello",
            defaultValue: "",
            hasValue: true,
          },
        ],
      });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.controllerValues("modal-controller", "modal");

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: {
          type: CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        },
      },
    ]);
    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({
      success: true,
      values: [
        {
          name: "title",
          type: "string",
          value: "Hello",
          defaultValue: "",
          hasValue: true,
        },
      ],
    });
  });

  it("controllerTargets sends CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE to the content script", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({
        success: true,
        targets: [
          { id: "close-button", tagName: "button", name: "closeButton" },
        ],
      });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.controllerTargets(
      "modal-controller",
      "modal",
    );

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: {
          type: CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        },
      },
    ]);
    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({
      success: true,
      targets: [{ id: "close-button", tagName: "button", name: "closeButton" }],
    });
  });

  it("controllerOutlets sends CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE to the content script", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({
        success: true,
        outlets: [
          {
            id: "user-status-element",
            tagName: "div",
            name: "user-status",
          },
        ],
      });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.controllerOutlets(
      "modal-controller",
      "modal",
    );

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: {
          type: CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        },
      },
    ]);
    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({
      success: true,
      outlets: [
        {
          id: "user-status-element",
          tagName: "div",
          name: "user-status",
        },
      ],
    });
  });

  it("watchControllerValues connects events port and sends watch message", async () => {
    const sentMessages = [];
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      (message) => {
        sentMessages.push(message);
        return Promise.resolve({ success: true });
      },
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    await bridge.watchControllerValues("ctrl-1", "counter");

    expect(browserApi.connectCalls).toEqual([
      { name: PANEL_EVENTS_PORT_NAME_PREFIX + 42 },
    ]);
    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: {
          type: CONTENT_WATCH_VALUES_MESSAGE_TYPE,
          id: "ctrl-1",
          identifier: "counter",
        },
      },
    ]);
  });

  it("unwatchControllerValues sends unwatch message", async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({ success: true });
    });
    const bridge = new PanelBridge({ browserApi });

    await bridge.unwatchControllerValues();

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: { type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE },
      },
    ]);
  });

  it("watchControllerValues reuses existing port", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    await bridge.watchControllerValues("ctrl-1", "counter");
    await bridge.watchControllerValues("ctrl-1", "counter");

    expect(browserApi.connectCalls).toHaveLength(1);
  });

  it("onValuesChanged callback receives values-changed port messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    await bridge.watchControllerValues("ctrl-1", "counter");
    bridge.onValuesChanged(callback);

    const pushMessage = {
      type: VALUES_CHANGED_PUSH_TYPE,
      id: "ctrl-1",
      values: [{ name: "count", type: "number", value: 5 }],
    };
    const receivedMessage = JSON.parse(JSON.stringify(pushMessage));
    for (const cb of fakePort._listeners.message) {
      cb(receivedMessage);
    }

    expect(callback).toHaveBeenCalledWith(receivedMessage);
  });

  it("onValuesChanged callback ignores non-values-changed messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    await bridge.watchControllerValues("ctrl-1", "counter");
    bridge.onValuesChanged(callback);

    const otherMessage = { type: "some-other-type", data: "irrelevant" };
    for (const cb of fakePort._listeners.message) {
      cb(otherMessage);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it("onTreeChanged callback receives tree-changed port messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    bridge.onTreeChanged(callback);

    expect(browserApi.connectCalls).toEqual([
      { name: PANEL_EVENTS_PORT_NAME_PREFIX + 42 },
    ]);

    const pushMessage = { type: TREE_CHANGED_PUSH_TYPE };
    const receivedMessage = JSON.parse(JSON.stringify(pushMessage));
    for (const cb of fakePort._listeners.message) {
      cb(receivedMessage);
    }

    expect(callback).toHaveBeenCalledWith(receivedMessage);
  });

  it("onTreeChanged callback ignores non-tree-changed messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    bridge.onTreeChanged(callback);

    const otherMessage = { type: "some-other-type", data: "irrelevant" };
    for (const cb of fakePort._listeners.message) {
      cb(otherMessage);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it("onTurboEvent callback receives turbo-event port messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    bridge.onTurboEvent(callback);

    expect(browserApi.connectCalls).toEqual([
      { name: PANEL_EVENTS_PORT_NAME_PREFIX + 42 },
    ]);

    const pushMessage = {
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 12345,
    };
    const receivedMessage = JSON.parse(JSON.stringify(pushMessage));
    for (const cb of fakePort._listeners.message) {
      cb(receivedMessage);
    }

    expect(callback).toHaveBeenCalledWith(receivedMessage);
  });

  it("onTurboEvent callback ignores non-turbo-event messages", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    bridge.onTurboEvent(callback);

    const otherMessage = { type: "some-other-type", data: "irrelevant" };
    for (const cb of fakePort._listeners.message) {
      cb(otherMessage);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it("offTurboEvent clears the callback so subsequent pushes are dropped", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    const callback = vi.fn();
    bridge.onTurboEvent(callback);

    bridge.offTurboEvent();

    const pushMessage = {
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1,
    };
    for (const cb of fakePort._listeners.message) {
      cb(pushMessage);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it("offTurboEvent is safe when no callback was registered", async () => {
    const fakePort = createFakeExtensionPort();
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => fakePort,
    );
    const bridge = new PanelBridge({ browserApi });

    expect(() => bridge.offTurboEvent()).not.toThrow();
  });

  it("events port disconnect nulls the port and next watch reconnects", async () => {
    let callCount = 0;
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => {
        callCount++;
        return createFakeExtensionPort();
      },
    );
    const bridge = new PanelBridge({ browserApi });

    await bridge.watchControllerValues("ctrl-1", "counter");
    expect(bridge.eventsPort).not.toBeNull();

    const port = bridge.eventsPort;
    for (const cb of port._listeners.disconnect) {
      cb();
    }
    expect(bridge.eventsPort).toBeNull();

    await bridge.watchControllerValues("ctrl-1", "counter");
    expect(callCount).toBe(2);
  });
});
