import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
  PANEL_EVENTS_PORT_NAME_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";
import { PanelBridge } from "../../lib/panel-bridge.js";

function createFakePort() {
  const listeners = { message: [], disconnect: [] };
  return {
    name: undefined,
    postMessage: vi.fn(),
    onMessage: { addListener: (cb) => listeners.message.push(cb) },
    onDisconnect: { addListener: (cb) => listeners.disconnect.push(cb) },
    disconnect: vi.fn(),
    _listeners: listeners,
  };
}

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
        return connectHandler?.(options) ?? createFakePort();
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

    await bridge.inspectNode("frame-1");

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
  });

  it("inspectNode does not call inspectElementBySelector when response lacks success", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({ success: false, selector: "#frame-1" }),
    );
    const bridge = new PanelBridge({ browserApi });

    await bridge.inspectNode("frame-1");

    expect(browserApi.evalCalls).toEqual([]);
  });

  it("inspectNode does not call inspectElementBySelector when response lacks selector", async () => {
    const browserApi = createBrowserApi(() =>
      Promise.resolve({ success: true, selector: null }),
    );
    const bridge = new PanelBridge({ browserApi });

    await bridge.inspectNode("frame-1");

    expect(browserApi.evalCalls).toEqual([]);
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

  it("watchControllerValues connects events port and sends watch message", async () => {
    const sentMessages = [];
    const fakePort = createFakePort();
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
    const fakePort = createFakePort();
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
    const fakePort = createFakePort();
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
    for (const cb of fakePort._listeners.message) {
      cb(pushMessage);
    }

    expect(callback).toHaveBeenCalledWith(pushMessage);
  });

  it("onValuesChanged callback ignores non-values-changed messages", async () => {
    const fakePort = createFakePort();
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

  it("events port disconnect nulls the port and next watch reconnects", async () => {
    let callCount = 0;
    const browserApi = createBrowserApi(
      () => Promise.resolve({ success: true }),
      { success: true, name: "temp1" },
      () => {
        callCount++;
        return createFakePort();
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
