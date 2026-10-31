// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { captureTurboEvents } from "../../lib/main_world/capture-turbo-events.js";
import { MAIN_WORLD_TURBO_EVENT_NAME } from "../../lib/constants.js";
import { MainWorldRuntime } from "../../lib/main_world/runtime.js";
import { createControllerStorage } from "../../lib/main_world/controller-storage.js";
import { createControllerDefinitions } from "../../lib/main_world/controller-definitions.js";

const cleanups = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
const name = "turbo:before-frame-render";
function start() {
  const feature = captureTurboEvents(document);
  cleanups.push(() => feature.stop());
  feature.start();
  return feature;
}

function observeBridge(listener, capture = false) {
  document.addEventListener(MAIN_WORLD_TURBO_EVENT_NAME, listener, capture);
  cleanups.push(() =>
    document.removeEventListener(
      MAIN_WORLD_TURBO_EVENT_NAME,
      listener,
      capture,
    ),
  );
}

it("has no effects before startup and symmetric idempotent listeners", () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const feature = captureTurboEvents(document);
  expect(feature.operations).toEqual({});
  expect(add).not.toHaveBeenCalled();
  feature.stop();
  feature.start();
  feature.start();
  feature.stop();
  feature.stop();
  expect(add.mock.calls).toEqual([[name, expect.any(Function), true]]);
  expect(remove.mock.calls).toEqual(add.mock.calls);
});

it("emits one JSON record on the original target and preserves the live source event", () => {
  const target = document.createElement("turbo-frame");
  document.body.append(target);
  const incoming = document.createElement("turbo-frame");
  incoming.textContent = "incoming";
  const records = [];
  const listener = (event) =>
    records.push({
      target: event.target,
      detail: event.detail,
      bubbles: event.bubbles,
    });
  observeBridge(listener, true);
  start();
  const source = new CustomEvent(name, {
    bubbles: true,
    cancelable: true,
    detail: {
      newFrame: incoming,
      render() {
        throw new Error("never serialize");
      },
    },
  });
  const later = vi.fn((event) => {
    expect(event).toBe(source);
    expect(event.detail.newFrame).toBe(incoming);
  });
  target.addEventListener(name, later);
  expect(target.dispatchEvent(source)).toBe(true);
  expect(source.defaultPrevented).toBe(false);
  expect(later).toHaveBeenCalledTimes(1);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    target,
    bubbles: true,
    detail: expect.any(String),
  });
  expect(JSON.parse(records[0].detail)).toEqual({
    name,
    timestamp: expect.any(Number),
    details: { html: incoming.outerHTML },
  });
});

it.each(["document", "text", "detached", "foreign"])(
  "falls back to document for a %s target, including empty details",
  (kind) => {
    const listener = vi.fn();
    observeBridge(listener);
    const add = vi.spyOn(document, "addEventListener");
    start();
    // Invoke the registered source handler to exercise targets that cannot reach document naturally.
    const target =
      kind === "document"
        ? document
        : kind === "text"
          ? document.createTextNode("text")
          : document.createElement("div");
    if (kind === "foreign") {
      document.body.append(target);
      Object.defineProperty(target, "ownerDocument", {
        value: document.implementation.createHTMLDocument(),
      });
    }
    add.mock.calls[0][1]({ type: name, target });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].target).toBe(document);
    expect(JSON.parse(listener.mock.calls[0][0].detail).details).toEqual({});
  },
);

it("starts alongside independent Stimulus services and keeps them after a failed capture", () => {
  const runtime = new MainWorldRuntime(document, [
    createControllerStorage,
    createControllerDefinitions,
    captureTurboEvents,
  ]);
  cleanups.push(() => runtime.stop());
  runtime.start();
  document.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        get newFrame() {
          throw new Error("broken");
        },
      },
    }),
  );
  expect([...runtime.operations.keys()]).toEqual([
    "storeController",
    "controllerValueDefinitions",
    "controllerOutletDefinitions",
  ]);
  expect(runtime.diagnostics).toEqual([]);
});
