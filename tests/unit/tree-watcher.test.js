// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TreeWatcher } from "../../lib/tree-watcher.js";

function createFakeObserverClass() {
  /** @type {any | null} */
  let lastInstance = null;
  const FakeObserver = vi.fn(function (callback) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    this._callback = callback;
    this._options = null;
    lastInstance = this;
  });
  FakeObserver._lastInstance = () => lastInstance;
  return FakeObserver;
}

function createFakeRecord(options) {
  return {
    type: options.type,
    attributeName: options.attributeName,
    target: options.target,
  };
}

describe("TreeWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts with an initial scan and does not call onChange", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(FakeObserver).toHaveBeenCalledTimes(1);
    expect(FakeObserver._lastInstance().observe).toHaveBeenCalledWith(
      document.documentElement,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-controller", "src"],
      },
    );
  });

  it("includes dynamic target attributes in the initial filter", () => {
    const scan = vi.fn(() => [
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();

    expect(FakeObserver._lastInstance().observe).toHaveBeenCalledWith(
      document.documentElement,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-controller", "src", "data-modal-target"],
      },
    );
  });

  it("debounces leading and calls onChange after the timer fires", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);

    const observer = FakeObserver._lastInstance();
    observer._callback([{ type: "childList" }]);
    observer._callback([{ type: "childList" }]);

    expect(scan).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(scan).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not call onChange when the snapshot is unchanged", () => {
    // Duplicate and use pop to ensure that different objects are returned.
    const items = [
      [{ id: "1", parentId: null, tagName: "div", controllers: ["modal"] }],
      [{ id: "1", parentId: null, tagName: "div", controllers: ["modal"] }],
    ];
    const scan = vi.fn(() => items.pop());
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer._callback([{ type: "childList" }]);
    vi.advanceTimersByTime(100);

    expect(scan).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("treats data-controller attribute changes as relevant", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);

    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: "data-controller",
        target: document.createElement("div"),
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("treats src changes on turbo-frames as relevant", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const frame = document.createElement("turbo-frame");
    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "turbo-frame", controllers: [] },
    ]);

    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: "src",
        target: frame,
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores src changes on non-turbo-frame elements", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const img = document.createElement("img");
    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);

    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: "src",
        target: img,
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("ignores mutation record types that do not affect the tree", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    FakeObserver._lastInstance()._callback([{ type: "characterData" }]);
    vi.advanceTimersByTime(100);

    expect(onChange).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("treats changes to tracked target attributes as relevant", () => {
    const scan = vi.fn(() => [
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    scan.mockReturnValue([
      {
        id: "1",
        parentId: null,
        tagName: "div",
        controllers: ["modal"],
      },
      {
        id: "2",
        parentId: "1",
        tagName: "button",
        controllers: [],
        targets: [{ controller: "modal", name: "button" }],
      },
    ]);

    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: "data-modal-target",
        target: document.createElement("button"),
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores changes to untracked target attributes", () => {
    const scan = vi.fn(() => [
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: "data-other-target",
        target: document.createElement("button"),
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores attribute records without an attribute name", () => {
    const scan = vi.fn(() => [
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer._callback([
      createFakeRecord({
        type: "attributes",
        attributeName: null,
        target: document.createElement("div"),
      }),
    ]);
    vi.advanceTimersByTime(100);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reconnectObserver is safe when no observer is set", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    expect(() => watcher.reconnectObserver()).not.toThrow();
  });

  it("updates the observer filter when the target attribute set changes", () => {
    const scan = vi.fn(() => [
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer.observe.mockClear();
    observer.disconnect.mockClear();

    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "div", controllers: ["tabs"] },
    ]);
    observer._callback([{ type: "childList" }]);
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(observer.observe).toHaveBeenCalledWith(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-controller", "src", "data-tabs-target"],
    });
  });

  it("stops the observer and clears the pending timer", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer._callback([{ type: "childList" }]);

    watcher.stop();

    expect(observer.disconnect).toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("starts a new debounce after a previous timer has fired", () => {
    const scan = vi.fn(() => []);
    const onChange = vi.fn();
    const FakeObserver = createFakeObserverClass();
    const watcher = new TreeWatcher({
      scan,
      onChange,
      document,
      observerClass: FakeObserver,
      debounceMs: 100,
    });

    watcher.start();
    const observer = FakeObserver._lastInstance();
    observer._callback([{ type: "childList" }]);
    scan.mockReturnValue([
      { id: "1", parentId: null, tagName: "div", controllers: ["modal"] },
    ]);
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);

    scan.mockReturnValue([
      {
        id: "1",
        parentId: null,
        tagName: "div",
        controllers: ["modal", "tabs"],
      },
    ]);
    observer._callback([{ type: "childList" }]);
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
