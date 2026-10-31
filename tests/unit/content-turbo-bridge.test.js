// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { ContentInspector } from "../../lib/content-inspector.js";
import {
  MAIN_WORLD_TURBO_EVENT_NAME,
  TURBO_EVENT_PUSH_TYPE,
} from "../../lib/constants.js";
import { createFakeExtensionPort } from "./helpers/port.js";

const inspectors = [];
afterEach(() => {
  inspectors.splice(0).forEach((inspector) => inspector.disconnect());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
const payload = {
  name: "turbo:before-frame-render",
  timestamp: 1700000000000,
  details: { html: "<turbo-frame></turbo-frame>" },
};
function setup(options = {}) {
  const port = createFakeExtensionPort();
  const inspector = new ContentInspector({
    document,
    connectPort: () => port,
    ...options,
  });
  inspectors.push(inspector);
  return { inspector, port };
}
function dispatch(target = document, detail = JSON.stringify(payload)) {
  target.dispatchEvent(
    new CustomEvent(MAIN_WORLD_TURBO_EVENT_NAME, { bubbles: true, detail }),
  );
}

it("registers before opening ports and forwards exact pushes with stable isolated identity", () => {
  const port = createFakeExtensionPort();
  const { inspector } = setup({
    connectPort() {
      dispatch();
      return port;
    },
  });
  // No queue for the event emitted while the port was being opened.
  expect(port.postMessage).not.toHaveBeenCalled();
  const target = document.createElement("turbo-frame");
  document.body.append(target);
  dispatch(target);
  dispatch(target);
  const key = port.postMessage.mock.calls[0][0].targetId;
  expect(key).toMatch(/^hotwire-inspector-/);
  expect(port.postMessage.mock.calls.map(([push]) => push)).toEqual(
    Array(2).fill({ type: TURBO_EVENT_PUSH_TYPE, ...payload, targetId: key }),
  );
  target.id = "existing";
  dispatch(target);
  expect(port.postMessage.mock.lastCall[0].targetId).toBe("existing");
  expect(target.attributes.length).toBe(1);
  inspector.startMainWorldTurboEventListener();
  dispatch();
  expect(port.postMessage).toHaveBeenCalledTimes(4);
  expect(port.postMessage.mock.lastCall[0].targetId).toBeNull();
});

it("ignores malformed payloads and never subscribes to the MAIN owned source event in isolation", () => {
  const add = vi.spyOn(document, "addEventListener");
  const { inspector, port } = setup();
  inspector.startTurboEventWatcher();
  expect(add.mock.calls.some(([name]) => name === payload.name)).toBe(false);
  dispatch(document, "invalid");
  dispatch(document, { ...payload });
  document.dispatchEvent(new CustomEvent(payload.name, { detail: {} }));
  expect(port.postMessage).not.toHaveBeenCalled();
});

it.each(["text", "foreign", "detached"])("rejects %s targets", (kind) => {
  const add = vi.spyOn(document, "addEventListener");
  const { port } = setup();
  const listener = add.mock.calls.find(
    ([name]) => name === MAIN_WORLD_TURBO_EVENT_NAME,
  )[1];
  const target =
    kind === "text"
      ? document.createTextNode("text")
      : document.createElement("a");
  if (kind === "foreign") {
    document.body.append(target);
    Object.defineProperty(target, "ownerDocument", {
      value: document.implementation.createHTMLDocument(),
    });
  }
  listener({ target, detail: JSON.stringify(payload) });
  expect(port.postMessage.mock.lastCall[0].targetId).toBeNull();
});

it("tolerates missing and disconnected ports and removes its exact listener", () => {
  const { inspector } = setup({ connectPort: null });
  expect(() => dispatch()).not.toThrow();
  inspector.reconnectingPort = {
    port: null,
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  };
  expect(() => dispatch()).not.toThrow();
  const remove = vi.spyOn(document, "removeEventListener");
  inspector.disconnect();
  inspector.disconnect();
  expect(
    remove.mock.calls.filter(([name]) => name === MAIN_WORLD_TURBO_EVENT_NAME),
  ).toHaveLength(1);
});

it("does not push after disconnect", () => {
  const { inspector, port } = setup();
  inspector.disconnect();
  dispatch();
  expect(port.postMessage).not.toHaveBeenCalled();
});
