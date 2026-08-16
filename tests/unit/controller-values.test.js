// @vitest-environment happy-dom

import { Application, Controller } from "@hotwired/stimulus";
import { describe, expect, it } from "vitest";
import {
  extractControllerValueDefinitions,
  formatControllerValue,
  resolveControllerValues,
} from "../../lib/controller-values.js";

function createElement(attributes = {}) {
  const element = document.createElement("div");

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

describe("extractControllerValueDefinitions", () => {
  it("returns an empty list when the controller is missing", () => {
    expect(extractControllerValueDefinitions(null)).toEqual([]);
    expect(extractControllerValueDefinitions(undefined)).toEqual([]);
  });

  it("returns an empty list when the controller has no value descriptor map", () => {
    expect(extractControllerValueDefinitions({ name: "mock" })).toEqual([]);
  });

  it("returns an empty list when the value descriptor map is not an object", () => {
    const controller = { valueDescriptorMap: Object.values };

    expect(extractControllerValueDefinitions(controller)).toEqual([]);
  });

  it("extracts value definitions from the descriptor map", () => {
    const controller = {
      valueDescriptorMap: {
        "data-modal-title-value": {
          name: "titleValue",
          type: "string",
          defaultValue: "",
        },
        "data-modal-count-value": {
          name: "countValue",
          type: "number",
          defaultValue: 0,
        },
        "data-modal-enabled-value": {
          name: "enabledValue",
          type: "boolean",
          defaultValue: false,
        },
        "data-modal-config-value": {
          name: "configValue",
          type: "object",
          defaultValue: { theme: "light" },
        },
        "data-modal-items-value": {
          name: "itemsValue",
          type: "array",
          defaultValue: [],
        },
      },
    };

    expect(extractControllerValueDefinitions(controller)).toEqual([
      {
        name: "title",
        type: "string",
        defaultValue: "",
        attributeName: "data-modal-title-value",
      },
      {
        name: "count",
        type: "number",
        defaultValue: 0,
        attributeName: "data-modal-count-value",
      },
      {
        name: "enabled",
        type: "boolean",
        defaultValue: false,
        attributeName: "data-modal-enabled-value",
      },
      {
        name: "config",
        type: "object",
        defaultValue: { theme: "light" },
        attributeName: "data-modal-config-value",
      },
      {
        name: "items",
        type: "array",
        defaultValue: [],
        attributeName: "data-modal-items-value",
      },
    ]);
  });

  it("recovers camelCase value names from blessed property names", () => {
    const controller = {
      valueDescriptorMap: {
        "data-modal-content-type-value": {
          name: "contentTypeValue",
          type: "string",
          defaultValue: "text/plain",
        },
      },
    };

    expect(extractControllerValueDefinitions(controller)).toEqual([
      {
        name: "contentType",
        type: "string",
        defaultValue: "text/plain",
        attributeName: "data-modal-content-type-value",
      },
    ]);
  });

  it("reports an unknown type when the descriptor type is missing", () => {
    const controller = {
      valueDescriptorMap: {
        "data-modal-mystery-value": { name: "mysteryValue" },
      },
    };

    expect(extractControllerValueDefinitions(controller)).toEqual([
      {
        name: "mystery",
        type: "unknown",
        defaultValue: undefined,
        attributeName: "data-modal-mystery-value",
      },
    ]);
  });
});

describe("resolveControllerValues", () => {
  const definitions = [
    {
      name: "title",
      type: "string",
      defaultValue: "",
      attributeName: "data-modal-title-value",
    },
    {
      name: "count",
      type: "number",
      defaultValue: 0,
      attributeName: "data-modal-count-value",
    },
    {
      name: "enabled",
      type: "boolean",
      defaultValue: false,
      attributeName: "data-modal-enabled-value",
    },
  ];

  it("reads current values as raw attribute strings off the element", () => {
    const element = createElement({
      "data-modal-title-value": "Greeting",
      "data-modal-count-value": "42",
    });

    expect(resolveControllerValues(definitions, element)).toEqual([
      {
        name: "title",
        type: "string",
        defaultValue: "",
        value: "Greeting",
        hasValue: true,
      },
      {
        name: "count",
        type: "number",
        defaultValue: 0,
        value: "42",
        hasValue: true,
      },
      {
        name: "enabled",
        type: "boolean",
        defaultValue: false,
        value: null,
        hasValue: false,
      },
    ]);
  });

  it("treats an empty attribute as a set value", () => {
    const element = createElement({ "data-modal-title-value": "" });

    const [title] = resolveControllerValues(definitions, element);

    expect(title).toEqual({
      name: "title",
      type: "string",
      defaultValue: "",
      value: "",
      hasValue: true,
    });
  });
});

describe("with a real Stimulus application", () => {
  it("extracts definitions and resolves raw attribute values", async () => {
    class ModalController extends Controller {
      static values = {
        title: String,
        config: Object,
        tags: { type: Array, default: ["a"] },
      };
    }

    document.body.innerHTML = `
      <div data-controller="modal"
           data-modal-title-value="Greeting"
           data-modal-config-value='{"theme":"dark"}'></div>
    `;
    const application = Application.start();

    try {
      application.register("modal", ModalController);
      // Let Stimulus' mutation observer connect the controller.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const element = document.querySelector("[data-controller='modal']");
      const controller = application.getControllerForElementAndIdentifier(
        element,
        "modal",
      );

      const definitions = extractControllerValueDefinitions(controller);

      expect(definitions).toEqual([
        {
          name: "title",
          type: "string",
          defaultValue: "",
          attributeName: "data-modal-title-value",
        },
        {
          name: "config",
          type: "object",
          defaultValue: {},
          attributeName: "data-modal-config-value",
        },
        {
          name: "tags",
          type: "array",
          defaultValue: ["a"],
          attributeName: "data-modal-tags-value",
        },
      ]);

      expect(resolveControllerValues(definitions, element)).toEqual([
        {
          name: "title",
          type: "string",
          defaultValue: "",
          value: "Greeting",
          hasValue: true,
        },
        {
          name: "config",
          type: "object",
          defaultValue: {},
          value: '{"theme":"dark"}',
          hasValue: true,
        },
        {
          name: "tags",
          type: "array",
          defaultValue: ["a"],
          value: null,
          hasValue: false,
        },
      ]);
    } finally {
      application.stop();
      document.body.innerHTML = "";
    }
  });
});

describe("formatControllerValue", () => {
  it("returns strings unchanged", () => {
    expect(formatControllerValue("hello")).toBe("hello");
    expect(formatControllerValue("")).toBe("");
  });

  it("stringifies numbers and booleans", () => {
    expect(formatControllerValue(42)).toBe("42");
    expect(formatControllerValue(0)).toBe("0");
    expect(formatControllerValue(true)).toBe("true");
    expect(formatControllerValue(false)).toBe("false");
  });

  it("serializes objects and arrays as JSON", () => {
    expect(formatControllerValue({ theme: "dark" })).toBe('{"theme":"dark"}');
    expect(formatControllerValue(["one", "two"])).toBe('["one","two"]');
  });

  it("stringifies null and undefined", () => {
    expect(formatControllerValue(null)).toBe("null");
    expect(formatControllerValue(undefined)).toBe("undefined");
  });
});
