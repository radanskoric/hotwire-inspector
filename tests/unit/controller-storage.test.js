// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createControllerStorage } from "../../lib/main_world/controller-storage.js";
import {
  findController,
  detectApplication,
} from "../../lib/main_world/controller-lookup.js";
import { failure } from "../../lib/main_world/protocol.js";

let invoke;
const controller = { identifier: "modal" };
beforeEach(() => {
  document.body.innerHTML = '<div id="host" data-controller="modal"></div>';
  vi.spyOn(console, "info").mockImplementation(() => {});
  const feature = createControllerStorage(document);
  feature.start();
  feature.start();
  invoke = (selector = "#host", identifier = "modal") => {
    try {
      return feature.operations.storeController.handle({
        version: 1,
        requestId: "test",
        operation: "storeController",
        selector,
        identifier,
      });
    } catch (error) {
      return failure(error);
    }
  };
});
afterEach(() => {
  for (const name of [
    "Stimulus",
    "stimulusApp",
    "StimulusApp",
    "temp1",
    "temp2",
    "temp3",
  ])
    delete window[name];
  delete Object.getPrototypeOf(window).temp2;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("handles a document without a window and an absent identifier", () => {
  expect(detectApplication(null)).toBeNull();
  window.Stimulus = {
    getControllerForElementAndIdentifier: vi.fn(() => controller),
  };
  expect(findController(document, "#host")).toEqual({ controller });
  expect(
    window.Stimulus.getControllerForElementAndIdentifier,
  ).toHaveBeenCalledWith(document.querySelector("#host"), "");
  const feature = createControllerStorage(document);
  expect(
    feature.operations.storeController.handle({ selector: "#host" }),
  ).toEqual({ success: true, name: "temp1", identifier: "" });
  feature.stop();
  feature.stop();
  expect(window.temp1).toBe(controller);
});

it("contains page getter errors and skips temp names with setters", () => {
  Object.defineProperty(window, "Stimulus", {
    configurable: true,
    get() {
      throw new Error("page getter");
    },
  });
  expect(invoke()).toEqual({ success: false, error: "page getter" });
  delete window.Stimulus;
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  Object.defineProperty(window, "temp1", {
    configurable: true,
    set() {
      throw new Error("page setter");
    },
  });
  // Existing names are skipped even when they have setters.
  expect(invoke().name).toBe("temp2");
});

it.each(["Stimulus", "stimulusApp", "StimulusApp"])(
  "stores the exact controller from %s",
  (name) => {
    window[name] = {
      getControllerForElementAndIdentifier: vi.fn(() => controller),
    };
    expect(invoke()).toEqual({
      success: true,
      name: "temp1",
      identifier: "modal",
    });
    expect(window.temp1).toBe(controller);
    expect(
      window[name].getControllerForElementAndIdentifier,
    ).toHaveBeenCalledExactlyOnceWith(document.querySelector("#host"), "modal");
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "Hotwire Inspector: modal controller stored as temp1",
      controller,
    );
  },
);

it("prefers Stimulus, then stimulusApp, then StimulusApp, skipping invalid candidates", () => {
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  window.stimulusApp = {
    getControllerForElementAndIdentifier: () => ({ second: true }),
  };
  window.StimulusApp = {
    getControllerForElementAndIdentifier: () => ({ third: true }),
  };
  invoke();
  expect(window.temp1).toBe(controller);
  window.Stimulus = { getControllerForElementAndIdentifier: 1 };
  invoke();
  expect(window.temp2).toEqual({ second: true });
  window.stimulusApp = null;
  invoke();
  expect(window.temp3).toEqual({ third: true });
});

it("does not overwrite own or inherited temp names, even when undefined", () => {
  window.Stimulus = { getControllerForElementAndIdentifier: () => controller };
  window.temp1 = undefined;
  Object.getPrototypeOf(window).temp2 = "inherited";
  expect(invoke()).toEqual({
    success: true,
    name: "temp3",
    identifier: "modal",
  });
  expect(window.temp1).toBeUndefined();
  expect(window.temp2).toBe("inherited");
  expect(window.temp3).toBe(controller);
});

it.each([
  ["#missing", "Element not found"],
  [null, "Element not found"],
  ["#host", "Stimulus application not found"],
])("preserves the lookup failure for %s", (selector, error) => {
  expect(invoke(selector)).toEqual({ success: false, error });
  expect("temp1" in window).toBe(false);
});

it("reports a missing controller", () => {
  window.Stimulus = { getControllerForElementAndIdentifier: () => null };
  expect(invoke()).toEqual({ success: false, error: "Controller not found" });
});

it("contains invalid selectors and framework exceptions", () => {
  expect(invoke("[").success).toBe(false);
  window.Stimulus = {
    getControllerForElementAndIdentifier() {
      throw new Error("framework failed");
    },
  };
  expect(invoke()).toEqual({ success: false, error: "framework failed" });
  expect("temp1" in window).toBe(false);
});
