// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Application, Controller } from "@hotwired/stimulus";
import { MainWorldRuntime } from "../../lib/main_world/runtime.js";
import { ContentInspector } from "../../lib/content-inspector.js";
import { createControllerStorage } from "../../lib/main_world/controller-storage.js";
import {
  createControllerDefinitions,
  validateValueDefinitions,
  validateOutletDefinitions,
} from "../../lib/main_world/controller-definitions.js";
import { extractControllerValueDefinitions } from "../../lib/controller-values.js";
import { parseResponse } from "../../lib/main_world/protocol.js";
import {
  MAIN_WORLD_RPC_REQUEST_EVENT as REQUEST,
  MAIN_WORLD_RPC_RESPONSE_EVENT as RESPONSE,
} from "../../lib/constants.js";

let runtime, inspector;
const definition = (defaultValue = null) => ({
  name: "title",
  type: "string",
  attributeName: "data-modal-title-value",
  defaultValue,
});
const values = (definitions) => ({ success: true, definitions });
const request = () =>
  inspector.sendValueDefinitionsRequest({
    selector: "#host",
    identifier: "modal",
  });
const install = (controller, name = "Stimulus") => {
  window[name] = { getControllerForElementAndIdentifier: () => controller };
};
beforeEach(() => {
  document.body.innerHTML =
    '<div id="host" data-controller="modal" data-modal-title-value="live"></div>';
  runtime = new MainWorldRuntime(document, [
    createControllerStorage,
    createControllerDefinitions,
  ]);
  inspector = new ContentInspector({ document });
});
afterEach(() => {
  inspector.disconnect();
  runtime.stop();
  for (const name of ["Stimulus", "stimulusApp", "StimulusApp", "temp1"])
    delete window[name];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("registers without accessing framework or changing DOM/globals; teardown is idempotent", () => {
  const getter = vi.fn(() => {
    throw new Error("startup lookup");
  });
  Object.defineProperty(window, "Stimulus", {
    configurable: true,
    get: getter,
  });
  const html = document.documentElement.outerHTML;
  runtime.start();
  runtime.start();
  expect([...runtime.operations.keys()]).toEqual([
    "storeController",
    "controllerValueDefinitions",
    "controllerOutletDefinitions",
  ]);
  expect(getter).not.toHaveBeenCalled();
  expect(document.documentElement.outerHTML).toBe(html);
  expect("temp1" in window).toBe(false);
  runtime.stop();
  runtime.stop();
  expect(runtime.operations.size).toBe(0);
});

it.each(["Stimulus", "stimulusApp", "StimulusApp"])(
  "reads definitions through %s with JSON defaults preserved and no DOM mutation",
  async (name) => {
    const defaults = [null, true, 42, "text", [1, false], { nested: ["a"] }];
    const definitions = defaults.map(definition);
    install(
      {
        valueDescriptorMap: Object.fromEntries(
          definitions.map((d, i) => [
            `data-${i}`,
            { ...d, name: `title${i}Value` },
          ]),
        ),
        constructor: { outlets: ["menu", 1, "status"] },
      },
      name,
    );
    runtime.start();
    const html = document.documentElement.outerHTML;
    const result = await request();
    expect(result.definitions.map((d) => d.defaultValue)).toEqual(defaults);
    expect(result.definitions.map((d) => d.name)).toEqual(
      defaults.map((_, i) => `title${i}`),
    );
    expect(
      await inspector.sendOutletDefinitionsRequest({
        selector: "#host",
        identifier: "modal",
      }),
    ).toEqual({ success: true, outlets: ["menu", "status"] });
    expect(document.documentElement.outerHTML).toBe(html);
    expect("temp1" in window).toBe(false);
  },
);

it("characterizes inherited and default definitions from real Stimulus", async () => {
  class Parent extends Controller {
    static values = { title: String, count: { type: Number, default: 7 } };
  }
  class Modal extends Parent {
    static values = { options: { type: Object, default: { enabled: true } } };
    static outlets = ["menu"];
  }
  const application = Application.start();
  application.register("modal", Modal);
  window.Stimulus = application;
  try {
    await vi.waitFor(() =>
      expect(
        application.getControllerForElementAndIdentifier(
          document.querySelector("#host"),
          "modal",
        ),
      ).not.toBeNull(),
    );
    const controller = application.getControllerForElementAndIdentifier(
      document.querySelector("#host"),
      "modal",
    );
    runtime.start();
    expect(await request()).toEqual(
      values(extractControllerValueDefinitions(controller)),
    );
    expect((await request()).definitions.map((d) => d.defaultValue)).toEqual([
      "",
      7,
      { enabled: true },
    ]);
  } finally {
    application.stop();
  }
});

it("rechecks late applications, missing controllers and absent metadata", async () => {
  runtime.start();
  expect(await request()).toEqual({
    success: false,
    error: "Stimulus application not found",
  });
  install(null);
  expect((await request()).success).toBe(false);
  expect(
    await inspector.sendOutletDefinitionsRequest({
      selector: "#host",
      identifier: "modal",
    }),
  ).toEqual({ success: false, error: "Controller not found" });
  install({});
  expect(await request()).toEqual(values([]));
  expect(
    await inspector.sendOutletDefinitionsRequest({
      selector: "#host",
      identifier: "modal",
    }),
  ).toEqual({ success: true, outlets: [] });
});

it.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => {},
  Symbol("x"),
  new Date(),
  new Map(),
  new Array(1),
])(
  "rejects unsupported defaults without silently serializing them: %#",
  async (value) => {
    install({
      valueDescriptorMap: {
        title: { name: "titleValue", type: "string", defaultValue: value },
      },
    });
    runtime.start();
    expect((await request()).success).toBe(false);
  },
);

it("contains circular values, thrown getters and oversized serialization without disabling storage", async () => {
  const circular = {};
  circular.self = circular;
  const controller = {
    valueDescriptorMap: {
      title: { name: "titleValue", type: "object", defaultValue: circular },
    },
  };
  install(controller);
  runtime.start();
  expect((await request()).success).toBe(false);
  controller.valueDescriptorMap.title.defaultValue = "x".repeat(1024 * 1024);
  expect(await request()).toEqual({
    success: false,
    error: "Response too large",
  });
  Object.defineProperty(controller, "valueDescriptorMap", {
    get() {
      throw new Error("metadata getter");
    },
  });
  expect(await request()).toEqual({ success: false, error: "metadata getter" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await inspector.storeController("host", "modal")).success).toBe(true);
  expect(window.temp1).toBe(controller);
});

it("reconstructs defaults and accepts exact descriptor/outlet boundaries", () => {
  const input = values([definition({ nested: [null, false, 0, ""] })]);
  const result = validateValueDefinitions(input);
  expect(result).toEqual(input);
  expect(result).not.toBe(input);
  expect(result.definitions[0].defaultValue).not.toBe(
    input.definitions[0].defaultValue,
  );
  expect(
    validateValueDefinitions(values(Array(1024).fill(definition()))),
  ).not.toBeNull();
  expect(
    validateValueDefinitions(
      values([
        {
          name: "x".repeat(16384),
          type: "x".repeat(16384),
          attributeName: "x".repeat(16384),
          defaultValue: null,
        },
      ]),
    ),
  ).not.toBeNull();
  expect(
    validateOutletDefinitions({
      success: true,
      outlets: Array(1024).fill("x".repeat(1024)),
    }),
  ).not.toBeNull();
});

it.each([
  null,
  [],
  {},
  { success: false },
  { success: true, definitions: [], extra: 1 },
  values(null),
  values(Array(1025).fill(definition())),
  values([null]),
  values([{}]),
  values([{ ...definition(), extra: 1 }]),
  ...["name", "type", "attributeName"].flatMap((key) => [
    values([{ ...definition(), [key]: 1 }]),
    values([{ ...definition(), [key]: "x".repeat(16385) }]),
  ]),
])("rejects malformed definition records %#", (input) => {
  expect(validateValueDefinitions(input)).toBeNull();
});

it.each([
  null,
  [],
  {},
  { success: true, outlets: [], extra: 1 },
  { success: true, outlets: null },
  { success: true, outlets: [1] },
  { success: true, outlets: new Array(1) },
  { success: true, outlets: ["x".repeat(1025)] },
  { success: true, outlets: Array(1025).fill("x") },
])("rejects malformed outlet records %#", (input) => {
  expect(validateOutletDefinitions(input)).toBeNull();
});

it.each(["__proto__", "constructor", "prototype"])(
  "rejects dangerous default key %s",
  (key) => {
    expect(
      validateValueDefinitions(
        values([definition(JSON.parse(`{"${key}":null}`))]),
      ),
    ).toBeNull();
  },
);

it("enforces 32 nested containers and catches throwing default getters", () => {
  let value = null;
  for (let i = 0; i < 32; i++) value = { nested: value };
  expect(validateValueDefinitions(values([definition(value)]))).not.toBeNull();
  expect(validateValueDefinitions(values([definition([value])]))).toBeNull();
  const throwing = {
    get value() {
      throw new Error("getter");
    },
  };
  expect(() =>
    validateValueDefinitions(values([definition(throwing)])),
  ).toThrow("getter");
});

it("rejects properties JSON serialization would silently discard", () => {
  for (const value of [
    { [Symbol("hidden")]: 1 },
    Object.defineProperty({}, "hidden", { value: 1 }),
    Object.assign([], { extra: 1 }),
  ])
    expect(validateValueDefinitions(values([definition(value)]))).toBeNull();
});

it("accepts exactly 1 Mi code units and rejects the next code unit on the server and client", async () => {
  const envelope = {
    version: 1,
    requestId: "boundary",
    operation: "controllerValueDefinitions",
  };
  const descriptor = { name: "titleValue", type: "string", defaultValue: "" };
  const base = JSON.stringify({
    ...envelope,
    result: values([definition("")]),
  }).length;
  install({ valueDescriptorMap: { "data-modal-title-value": descriptor } });
  runtime.start();
  const replies = [];
  const listener = (event) => replies.push(event.detail);
  document.addEventListener(RESPONSE, listener);
  try {
    descriptor.defaultValue = "x".repeat(1024 * 1024 - base);
    const dispatch = () =>
      document.dispatchEvent(
        new CustomEvent(REQUEST, {
          detail: JSON.stringify({
            ...envelope,
            selector: "#host",
            identifier: "modal",
          }),
        }),
      );
    dispatch();
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies[0]).toHaveLength(1024 * 1024);
    const validators = { controllerValueDefinitions: validateValueDefinitions };
    expect(parseResponse(replies[0], validators).result.success).toBe(true);
    expect(parseResponse(replies[0] + " ", validators)).toBeNull();
    descriptor.defaultValue += "x";
    dispatch();
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    expect(JSON.parse(replies[1]).result).toEqual({
      success: false,
      error: "Response too large",
    });
  } finally {
    document.removeEventListener(RESPONSE, listener);
  }
});
