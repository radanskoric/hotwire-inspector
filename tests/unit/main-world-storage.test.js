// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MainWorldRuntime } from "../../lib/main_world/runtime.js";
import { ContentInspector } from "../../lib/content-inspector.js";
import {
  createControllerStorage,
  validateStoredController,
} from "../../lib/main_world/controller-storage.js";
import {
  MAIN_WORLD_RPC_REQUEST_EVENT as REQUEST,
  MAIN_WORLD_RPC_RESPONSE_EVENT as RESPONSE,
} from "../../lib/constants.js";

let runtime, inspector, injectScript;
const controller = { identifier: "modal" };
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="host" data-controller="modal"></div>';
  vi.spyOn(console, "info").mockImplementation(() => {});
  runtime = new MainWorldRuntime(document, [createControllerStorage]);
  injectScript = vi.fn();
  inspector = new ContentInspector({ document, injectScript });
});
afterEach(() => {
  inspector.disconnect();
  runtime.stop();
  for (const name of ["Stimulus", "temp1", "temp2"]) delete window[name];
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const store = () => inspector.storeController("host", "modal");

it("starts without framework lookup, storage, console output or DOM mutation", () => {
  const getter = vi.fn(() => {
    throw new Error("no startup lookup");
  });
  Object.defineProperty(window, "Stimulus", {
    configurable: true,
    get: getter,
  });
  const html = document.documentElement.outerHTML;
  runtime.start();
  runtime.start();
  expect(getter).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
  expect("temp1" in window).toBe(false);
  expect(document.documentElement.outerHTML).toBe(html);
  expect([...runtime.operations.keys()]).toEqual(["storeController"]);
});

it("stores once after delayed readiness and late framework initialization, without injecting", async () => {
  const result = store();
  await vi.advanceTimersByTimeAsync(100);
  window.Stimulus = {
    getControllerForElementAndIdentifier: vi.fn(() => controller),
  };
  runtime.start();
  await vi.advanceTimersByTimeAsync(50);
  await expect(result).resolves.toEqual({
    success: true,
    name: "temp1",
    identifier: "modal",
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(window.temp1).toBe(controller);
  expect("temp2" in window).toBe(false);
  expect(
    window.Stimulus.getControllerForElementAndIdentifier,
  ).toHaveBeenCalledTimes(1);
  expect(injectScript).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps concurrent responses and controller identities separate", async () => {
  document.body.innerHTML += '<div id="other" data-controller="other"></div>';
  const other = { identifier: "other" };
  window.Stimulus = {
    getControllerForElementAndIdentifier: (_element, identifier) =>
      identifier === "modal" ? controller : other,
  };
  runtime.start();
  const results = await Promise.all([
    store(),
    inspector.storeController("other", "other"),
  ]);
  expect(results).toEqual([
    { success: true, name: "temp1", identifier: "modal" },
    { success: true, name: "temp2", identifier: "other" },
  ]);
  expect(window.temp1).toBe(controller);
  expect(window.temp2).toBe(other);
});

it("rechecks the framework and controller on every request", async () => {
  runtime.start();
  await expect(store()).resolves.toEqual({
    success: false,
    error: "Stimulus application not found",
  });
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  await store();
  const replacement = { identifier: "replacement" };
  window.Stimulus = { getControllerForElementAndIdentifier: () => replacement };
  await store();
  expect(window.temp1).toBe(controller);
  expect(window.temp2).toBe(replacement);
});

it("returns page assignment errors through the MAIN failure response", async () => {
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  const pageWindow = new Proxy(window, {
    set() {
      throw new Error("page write failed");
    },
  });
  vi.spyOn(document, "defaultView", "get").mockReturnValue(pageWindow);
  runtime.start();
  await expect(store()).resolves.toEqual({
    success: false,
    error: "page write failed",
  });
  expect("temp1" in window).toBe(false);
});

it("times out without injection or storage when MAIN is unavailable", async () => {
  const result = store();
  await vi.advanceTimersByTimeAsync(5000);
  await expect(result).resolves.toEqual({
    success: false,
    error: "MAIN-world request timed out",
  });
  expect(injectScript).not.toHaveBeenCalled();
  expect("temp1" in window).toBe(false);
});

it("never retries a storage write when its reply is lost", async () => {
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  runtime.start();
  const registered = runtime.operations.get("storeController");
  runtime.operations.set("storeController", {
    ...registered,
    handle(request) {
      registered.handle(request);
      return new Promise(() => {});
    },
  });
  const result = store();
  await vi.advanceTimersByTimeAsync(5000);
  expect((await result).success).toBe(false);
  expect(window.temp1).toBe(controller);
  expect("temp2" in window).toBe(false);
  expect(console.info).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("disconnect rejects pending storage and removes probes", async () => {
  const result = store();
  inspector.disconnect();
  await expect(result).resolves.toEqual({
    success: false,
    error: "MAIN-world client disconnected",
  });
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores spoofed storage successes with the wrong identifier or shape", async () => {
  const listener = (event) => {
    const { version, requestId, operation } = JSON.parse(event.detail);
    const results =
      operation === "bridgeStatus"
        ? [{ success: true, operations: ["storeController"] }]
        : [
            { success: true, name: "temp1", identifier: "wrong" },
            { success: true, name: "temp0", identifier: "modal" },
            { success: true, name: "temp1", identifier: "modal", extra: true },
            { success: true, name: "temp2", identifier: "modal" },
          ];
    for (const result of results)
      document.dispatchEvent(
        new CustomEvent(RESPONSE, {
          detail: JSON.stringify({ version, requestId, operation, result }),
        }),
      );
  };
  document.addEventListener(REQUEST, listener);
  try {
    await expect(store()).resolves.toEqual({
      success: true,
      name: "temp2",
      identifier: "modal",
    });
  } finally {
    document.removeEventListener(REQUEST, listener);
  }
});

it("ignores invalid envelopes and stops serving storage after teardown without deleting temps", async () => {
  window.Stimulus = {
    getControllerForElementAndIdentifier: vi.fn(() => controller),
  };
  runtime.start();
  document.dispatchEvent(
    new CustomEvent(REQUEST, {
      detail: JSON.stringify({
        version: 1,
        requestId: "invalid",
        operation: "storeController",
        selector: "#host",
        identifier: "modal",
        extra: 1,
      }),
    }),
  );
  expect(
    window.Stimulus.getControllerForElementAndIdentifier,
  ).not.toHaveBeenCalled();
  await store();
  runtime.stop();
  runtime.stop();
  expect(window.temp1).toBe(controller);
  const result = store();
  await vi.advanceTimersByTimeAsync(5000);
  expect((await result).success).toBe(false);
  expect("temp2" in window).toBe(false);
});

it.each([
  null,
  [],
  {},
  { success: false },
  { success: true, name: "temp01", identifier: "modal" },
  { success: true, name: 1, identifier: "modal" },
  { success: true, name: "temp1", identifier: 1 },
])("rejects invalid storage result %#", (value) => {
  expect(validateStoredController(value)).toBeNull();
});

it("reconstructs valid storage results", () => {
  const value = { success: true, name: "temp12", identifier: "modal" };
  expect(validateStoredController(value)).toEqual(value);
  expect(validateStoredController(value)).not.toBe(value);
});
