// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValueWatcher } from "../../lib/value-watcher.js";

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
];

function createElement(attributes = {}) {
  const element = document.createElement("div");

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createFakeObserver() {
  /** @type {((mutations: any[]) => void) | null} */
  let callback = null;

  const observe = vi.fn(() => {});
  const disconnect = vi.fn(() => {});

  const FakeObserver = vi.fn(function (cb) {
    callback = cb;
    return { observe, disconnect };
  });

  return {
    FakeObserver,
    trigger: () => {
      if (callback) callback([]);
    },
    observe,
    disconnect,
  };
}

describe("ValueWatcher", () => {
  /** @type {(values: any[]) => void} */
  let push;
  let watcher;
  let fake;

  beforeEach(() => {
    push = vi.fn();
    fake = createFakeObserver();
  });

  it("observes with attributes: true and the correct attributeFilter", () => {
    const element = createElement();
    watcher = new ValueWatcher({
      element,
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    expect(fake.observe).toHaveBeenCalledTimes(1);
    expect(fake.observe).toHaveBeenCalledWith(element, {
      attributes: true,
      attributeFilter: ["data-modal-title-value", "data-modal-count-value"],
    });
  });

  it("creates no observer when definitions are empty", () => {
    const element = createElement();
    watcher = new ValueWatcher({
      element,
      definitions: [],
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    expect(fake.FakeObserver).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes resolved values on start and when observer triggers", () => {
    const element = createElement({
      "data-modal-title-value": "Hello",
      "data-modal-count-value": "5",
    });
    watcher = new ValueWatcher({
      element,
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    expect(push).toHaveBeenCalledWith([
      {
        name: "title",
        type: "string",
        defaultValue: "",
        value: "Hello",
        hasValue: true,
      },
      {
        name: "count",
        type: "number",
        defaultValue: 0,
        value: "5",
        hasValue: true,
      },
    ]);

    push.mockClear();

    element.setAttribute("data-modal-title-value", "World");
    fake.trigger();

    expect(push).toHaveBeenCalledWith([
      {
        name: "title",
        type: "string",
        defaultValue: "",
        value: "World",
        hasValue: true,
      },
      {
        name: "count",
        type: "number",
        defaultValue: 0,
        value: "5",
        hasValue: true,
      },
    ]);
  });

  it("suppresses a second push when values have not changed", () => {
    const element = createElement({
      "data-modal-title-value": "Hello",
      "data-modal-count-value": "5",
    });
    watcher = new ValueWatcher({
      element,
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    expect(push).toHaveBeenCalledTimes(1);

    push.mockClear();

    fake.trigger();

    expect(push).not.toHaveBeenCalled();
  });

  it("pushes with value: null, hasValue: false when an attribute is removed", () => {
    const element = createElement({
      "data-modal-title-value": "Hello",
      "data-modal-count-value": "5",
    });
    watcher = new ValueWatcher({
      element,
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    push.mockClear();

    element.removeAttribute("data-modal-count-value");
    fake.trigger();

    expect(push).toHaveBeenCalledWith([
      {
        name: "title",
        type: "string",
        defaultValue: "",
        value: "Hello",
        hasValue: true,
      },
      {
        name: "count",
        type: "number",
        defaultValue: 0,
        value: null,
        hasValue: false,
      },
    ]);
  });

  it("stop() disconnects the observer and ignores further callbacks", () => {
    const element = createElement({
      "data-modal-title-value": "Hello",
      "data-modal-count-value": "5",
    });
    watcher = new ValueWatcher({
      element,
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    watcher.start();

    push.mockClear();
    watcher.stop();

    expect(fake.disconnect).toHaveBeenCalledOnce();

    push.mockClear();
    fake.trigger();

    expect(push).not.toHaveBeenCalled();
  });

  it("stop() is safe before start() creates an observer", () => {
    const watcher = new ValueWatcher({
      element: createElement(),
      definitions,
      push,
      observerClass: fake.FakeObserver,
    });

    expect(() => watcher.stop()).not.toThrow();
    expect(fake.disconnect).not.toHaveBeenCalled();
  });
});
