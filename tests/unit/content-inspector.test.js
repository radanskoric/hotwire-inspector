// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContentInspector } from "../../lib/content-inspector.js";
import { createReconnectingPort } from "../../lib/port-reconnect.js";
import { TreeWatcher } from "../../lib/tree-watcher.js";
import {
  CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
  ID_PREFIX,
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
  TREE_CHANGED_PUSH_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";
import { createFakeExtensionPort } from "./helpers/port.js";
import { withFakeTimers } from "./helpers/fake-timers.js";

describe("ContentInspector", () => {
  let cssEscape;

  beforeEach(() => {
    document.body.innerHTML = "";
    cssEscape = (value) => value.replace(/:/g, "\\:");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createFakeObserverClass() {
    let lastInstance;
    const FakeObserver = vi.fn(function (callback) {
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      this._callback = callback;
      lastInstance = this;
    });
    FakeObserver._lastInstance = () => lastInstance;
    return FakeObserver;
  }

  it("can use global defaults with CSS escape and element node type", () => {
    const previousCss = globalThis.CSS;
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';

    globalThis.CSS = { escape: (value) => value.replace(/:/g, "\\:") };

    try {
      const inspector = new ContentInspector();
      inspector.scan();

      expect(inspector.inspect("frame:main")).toEqual({
        success: true,
        selector: "#frame\\:main",
      });
    } finally {
      globalThis.CSS = previousCss;
    }
  });

  it("falls back when CSS escape and Node globals are unavailable", () => {
    const previousCss = globalThis.CSS;
    const previousNode = globalThis.Node;
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';

    globalThis.CSS = undefined;
    globalThis.Node = undefined;

    try {
      const inspector = new ContentInspector({ document });
      inspector.scan();

      expect(inspector.inspect("frame:main")).toEqual({
        success: true,
        selector: "#frame:main",
      });
    } finally {
      globalThis.CSS = previousCss;
      globalThis.Node = previousNode;
    }
  });

  it("uses real element ids when present during scan", () => {
    document.body.innerHTML = '<turbo-frame id="main-frame"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: "main-frame",
        src: null,
        parentId: null,
        tagName: "turbo-frame",
        controllers: [],
      },
    ]);
  });

  it("includes controllers attached directly to frames during scan", () => {
    document.body.innerHTML =
      '<turbo-frame id="main-frame" data-controller="sidebar frame-loader"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: "main-frame",
        src: null,
        parentId: null,
        tagName: "turbo-frame",
        controllers: ["sidebar", "frame-loader"],
      },
    ]);
  });

  it("generates stable in-memory keys for elements without ids", () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });

    const firstScan = inspector.scan();
    const secondScan = inspector.scan();

    const firstId = firstScan[0].id;
    expect(firstId).toMatch(new RegExp(`^${ID_PREFIX}-`));
    expect(secondScan[0].id).toBe(firstId);
  });

  it("stores weak references in the reverse element lookup", () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const controller = document.querySelector('[data-controller="modal"]');
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();
    const ref = inspector.elementsByKey.get(id);

    expect(ref).toBeInstanceOf(WeakRef);
    expect(ref.deref()).toBe(controller);
  });

  it("treats stale generated-key weak references as missing elements", () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();

    inspector.elementsByKey.set(id, { deref: () => undefined });

    expect(inspector.highlight(id)).toEqual({ success: false });
  });

  it("falls back to document id lookup when a weak reference is stale", () => {
    document.body.innerHTML = '<turbo-frame id="main-frame"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();
    inspector.elementsByKey.set("main-frame", { deref: () => undefined });

    expect(inspector.inspect("main-frame")).toEqual({
      success: true,
      selector: "#main-frame",
    });
  });

  it("builds parent-child relationships during scan", () => {
    document.body.innerHTML = `
      <turbo-frame id="parent-frame">
        <div data-controller="dropdown menu"></div>
      </turbo-frame>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    const items = inspector.scan();
    expect(items[0]).toEqual({
      id: "parent-frame",
      src: null,
      parentId: null,
      tagName: "turbo-frame",
      controllers: [],
    });
    expect(items[1]).toMatchObject({
      parentId: "parent-frame",
      tagName: "div",
      controllers: ["dropdown", "menu"],
    });
    expect(items[1].id).toMatch(new RegExp(`^${ID_PREFIX}-`));
  });

  it("includes target elements found inside controller subtrees during scan", () => {
    document.body.innerHTML = `
      <section id="search-controller" data-controller="search">
        <input id="query-input" data-search-target="input result">
      </section>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: "search-controller",
        parentId: null,
        tagName: "section",
        controllers: ["search"],
      },
      {
        id: "query-input",
        parentId: "search-controller",
        tagName: "input",
        controllers: [],
        targets: [
          { controller: "search", name: "input" },
          { controller: "search", name: "result" },
        ],
      },
    ]);
  });

  it("renders one scan item for elements with multiple controller target attributes", () => {
    document.body.innerHTML = `
      <div id="controller" data-controller="search tabs">
        <button id="shared-target" data-search-target="input" data-tabs-target="tab selectedTab"></button>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    const items = inspector.scan();
    const targetItems = items.filter((item) => item.id === "shared-target");

    expect(targetItems).toHaveLength(1);
    expect(targetItems[0]).toMatchObject({
      parentId: "controller",
      tagName: "button",
      controllers: [],
      targets: [
        { controller: "search", name: "input" },
        { controller: "tabs", name: "tab" },
        { controller: "tabs", name: "selectedTab" },
      ],
    });
  });

  it("ignores target attributes with empty values during scan", () => {
    document.body.innerHTML = `
      <div id="controller" data-controller="search">
        <button id="empty-target" data-search-target=""></button>
        <input id="real-target" data-search-target="input">
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: "controller",
        parentId: null,
        tagName: "div",
        controllers: ["search"],
      },
      {
        id: "real-target",
        parentId: "controller",
        tagName: "input",
        controllers: [],
        targets: [{ controller: "search", name: "input" }],
      },
    ]);
  });

  it("can inspect target-only elements discovered during scan", () => {
    document.body.innerHTML = `
      <div data-controller="modal">
        <button id="close-button" data-modal-target="closeButton"></button>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(inspector.inspect("close-button")).toEqual({
      success: true,
      selector: "#close-button",
    });
  });

  it("highlights and clears highlight with an overlay while preserving target inline styles", () => {
    document.body.innerHTML = `
      <div data-controller="modal" style="outline: 1px dashed red; outline-offset: 1px;"></div>
    `;
    const controller = document.querySelector('[data-controller="modal"]');
    controller.getBoundingClientRect = () => ({
      top: 10,
      left: 20,
      width: 300,
      height: 40,
    });
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();

    expect(inspector.highlight(id)).toEqual({ success: true });
    expect(controller.style.outline).toBe("red dashed 1px");
    expect(controller.style.outlineOffset).toBe("1px");

    const overlay = document.body.lastElementChild;
    expect(overlay.style).toMatchObject({
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxSizing: "border-box",
      outline: "rgb(37, 99, 235) dashed 3px",
      background: "rgba(37, 99, 235, 0.12)",
      borderRadius: "2px",
      top: "10px",
      left: "20px",
      width: "300px",
      height: "40px",
    });

    expect(inspector.clearHighlight()).toEqual({ success: true });
    expect(document.body.children).toHaveLength(1);
    expect(controller.style.outline).toBe("red dashed 1px");
    expect(controller.style.outlineOffset).toBe("1px");
  });

  it("returns a selector for inspect using escaped ids when available", () => {
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(inspector.inspect("frame:main")).toEqual({
      success: true,
      selector: "#frame\\:main",
    });
  });

  it("returns no selector when inspecting a missing element", () => {
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.inspect("missing")).toEqual({
      success: false,
      selector: null,
    });
  });

  it("builds a structural selector for elements without ids", () => {
    document.body.innerHTML = `
      <div>
        <div data-controller="first"></div>
        <div data-controller="second"></div>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });
    const items = inspector.scan();

    expect(inspector.inspect(items[1].id)).toEqual({
      success: true,
      selector:
        "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2)",
    });
  });

  it("does not mutate target DOM attributes while scanning", () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const controller = document.querySelector('[data-controller="modal"]');
    const setAttributeSpy = vi.spyOn(controller, "setAttribute");
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(setAttributeSpy).not.toHaveBeenCalled();
  });

  it("round-trips controller storage via JSON stringified event details (Firefox compartment)", async () => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({
      document,
      cssEscape,
      injectScript,
    });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: detail.requestId,
            success: true,
            name: "temp1",
            identifier: "modal",
          }),
        }),
      );
    });

    inspector.scan();

    await expect(
      inspector.storeController("modal-controller", "modal"),
    ).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
      name: "temp1",
      identifier: "modal",
    });
  });

  it("returns an error when storing a controller for a missing element", async () => {
    const inspector = new ContentInspector({ document, cssEscape });

    await expect(
      inspector.storeController("missing", "modal"),
    ).resolves.toEqual({
      success: false,
      error: "Element not found",
    });
  });

  it("stores a controller through the injected page script", async () => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({
      document,
      cssEscape,
      injectScript,
    });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: "unrelated-request",
            success: false,
          }),
        }),
      );
      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: detail.requestId,
            success: true,
            name: "temp1",
            identifier: "modal",
          }),
        }),
      );
    });

    inspector.scan();

    await expect(
      inspector.storeController("modal-controller", "modal"),
    ).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
      name: "temp1",
      identifier: "modal",
    });
  });

  it("returns injected script loader failures as controller storage errors", async () => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    await expect(
      inspector.storeController("modal-controller", "modal"),
    ).resolves.toEqual({
      success: false,
      error: "Injected page script loader unavailable",
    });
  });

  it("uses fallback storage error text and global CustomEvent when needed", async () => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({
      document,
      cssEscape,
      injectScript,
    });

    vi.spyOn(document, "defaultView", "get").mockReturnValue(null);
    inspector.sendStoreControllerRequest = async () => {
      throw new Error();
    };
    inspector.scan();

    await expect(
      inspector.storeController("modal-controller", "modal"),
    ).resolves.toEqual({
      success: false,
      error: "Controller storage failed",
    });

    inspector.sendStoreControllerRequest =
      ContentInspector.prototype.sendStoreControllerRequest;
    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: detail.requestId,
            success: true,
          }),
        }),
      );
    });

    await expect(
      inspector.storeController("modal-controller", "modal"),
    ).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
    });
  });

  it("reuses the injected script for subsequent controller storage requests", async () => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    let injectionCount = 0;
    const injectScript = () => {
      injectionCount += 1;
      return Promise.resolve(script);
    };
    const inspector = new ContentInspector({
      document,
      cssEscape,
      injectScript,
    });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: detail.requestId,
            success: true,
            name: `temp${injectionCount}`,
            identifier: "modal",
          }),
        }),
      );
    });

    inspector.scan();

    await inspector.storeController("modal-controller", "modal");
    await inspector.storeController("modal-controller", "modal");

    expect(injectionCount).toBe(1);
  });

  describe("controllerValues", () => {
    const definitions = [
      {
        name: "title",
        type: "string",
        defaultValue: "",
        attributeName: "data-modal-title-value",
      },
      {
        name: "enabled",
        type: "boolean",
        defaultValue: false,
        attributeName: "data-modal-enabled-value",
      },
    ];

    it("resolves values from definitions and element attributes", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Greeting"></div>';
      const script = new EventTarget();
      const injectScript = () => Promise.resolve({ script });
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
      });

      script.addEventListener(
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);

          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: "unrelated-request",
                success: false,
              }),
            }),
          );
          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: true,
                definitions,
              }),
            }),
          );
        },
      );

      inspector.scan();

      await expect(
        inspector.controllerValues("modal-controller", "modal"),
      ).resolves.toEqual({
        success: true,
        values: [
          {
            name: "title",
            type: "string",
            defaultValue: "",
            value: "Greeting",
            hasValue: true,
          },
          {
            name: "enabled",
            type: "boolean",
            defaultValue: false,
            value: null,
            hasValue: false,
          },
        ],
      });
    });

    it("returns injected script errors unchanged", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const script = new EventTarget();
      const injectScript = () => Promise.resolve({ script });
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
      });

      script.addEventListener(
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);

          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: false,
                error: "Controller not found",
              }),
            }),
          );
        },
      );

      inspector.scan();

      await expect(
        inspector.controllerValues("modal-controller", "modal"),
      ).resolves.toEqual({
        requestId: expect.any(String),
        success: false,
        error: "Controller not found",
      });
    });

    it("returns an error when reading values for a missing element", async () => {
      const inspector = new ContentInspector({ document, cssEscape });

      await expect(
        inspector.controllerValues("missing", "modal"),
      ).resolves.toEqual({
        success: false,
        error: "Element not found",
      });
    });

    it("returns injected script loader failures as value errors", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.scan();

      await expect(
        inspector.controllerValues("modal-controller", "modal"),
      ).resolves.toEqual({
        success: false,
        error: "Injected page script loader unavailable",
      });
    });

    it("uses fallback values error text when the request fails without a message", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.sendValueDefinitionsRequest = async () => {
        throw new Error();
      };
      inspector.scan();

      await expect(
        inspector.controllerValues("modal-controller", "modal"),
      ).resolves.toEqual({
        success: false,
        error: "Controller values failed",
      });
    });

    it("reuses the injected script for subsequent values requests", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const script = new EventTarget();
      let injectionCount = 0;
      const injectScript = () => {
        injectionCount += 1;
        return Promise.resolve(script);
      };
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
      });

      script.addEventListener(
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);

          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: true,
                definitions: [],
              }),
            }),
          );
        },
      );

      inspector.scan();

      await inspector.controllerValues("modal-controller", "modal");
      await inspector.controllerValues("modal-controller", "modal");

      expect(injectionCount).toBe(1);
    });

    function setupTimeoutInspector({ respondImmediately = false } = {}) {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const script = new EventTarget();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
        requestTimeoutMs: 100,
      });

      if (respondImmediately) {
        script.addEventListener(
          CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
          (event) => {
            const detail = JSON.parse(event.detail);
            script.dispatchEvent(
              new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
                detail: JSON.stringify({
                  requestId: detail.requestId,
                  success: true,
                  definitions: [],
                }),
              }),
            );
          },
        );
      }

      inspector.scan();
      return { script, inspector };
    }

    it("settles with an error response when the injected page script never answers", async () => {
      await withFakeTimers(async () => {
        const { inspector } = setupTimeoutInspector();

        const neverSettled = Symbol("never-settled");
        const result = await Promise.race([
          inspector.controllerValues("modal-controller", "modal"),
          vi.advanceTimersByTimeAsync(60_000).then(() => neverSettled),
        ]);

        expect(result).not.toBe(neverSettled);
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            error: expect.any(String),
          }),
        );
        expect(result.error.toLowerCase()).toContain("respond");
      });
    });

    it("does not double-settle when a late response arrives after the timeout", async () => {
      await withFakeTimers(async () => {
        const { inspector, script } = setupTimeoutInspector();

        const result = await Promise.race([
          inspector.controllerValues("modal-controller", "modal"),
          vi.advanceTimersByTimeAsync(60_000).then(() => Symbol("never")),
        ]);

        expect(result).toEqual(
          expect.objectContaining({
            success: false,
          }),
        );

        const list = script.eventNames?.() ?? [];
        // No leftover listeners after the timeout fired.
        expect(list).not.toContain(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT);

        // Dispatching a stale response event must not throw.
        expect(() =>
          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: "stale",
                success: true,
                definitions: [],
              }),
            }),
          ),
        ).not.toThrow();
      });
    });

    it("clears the timeout when the injected page script answers in time", async () => {
      await withFakeTimers(async () => {
        const { inspector } = setupTimeoutInspector({
          respondImmediately: true,
        });

        await expect(
          inspector.controllerValues("modal-controller", "modal"),
        ).resolves.toEqual(expect.objectContaining({ success: true }));

        // No leftover timer for the request we just settled.
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });

  describe("controllerTargets", () => {
    it("returns each element declared as a target", () => {
      document.body.innerHTML = `
        <div id="modal-controller" data-controller="modal">
          <button id="close-button" data-modal-target="closeButton"></button>
          <input id="trigger" data-modal-target="trigger">
        </div>
      `;
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.scan();

      expect(inspector.controllerTargets("modal-controller", "modal")).toEqual({
        success: true,
        targets: [
          { id: "close-button", tagName: "button", name: "closeButton" },
          { id: "trigger", tagName: "input", name: "trigger" },
        ],
      });
    });

    it("returns an empty list when the controller declares no targets", () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.scan();

      expect(inspector.controllerTargets("modal-controller", "modal")).toEqual({
        success: true,
        targets: [],
      });
    });

    it("returns an error when the element is not found", () => {
      const inspector = new ContentInspector({ document, cssEscape });

      expect(inspector.controllerTargets("missing", "modal")).toEqual({
        success: false,
        error: "Element not found",
      });
    });
  });

  describe("controllerOutlets", () => {
    function makeOutletDefinitionsScript(script, names) {
      script.addEventListener(
        CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);

          script.dispatchEvent(
            new CustomEvent(CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: true,
                outlets: names,
              }),
            }),
          );
        },
      );
    }

    it("resolves outlets using the default selector when no explicit attribute is set", async () => {
      document.body.innerHTML = `
        <div id="host" data-controller="host">
          <div id="status-el" data-controller="user-status"></div>
          <div id="menu-el" data-controller="menu"></div>
        </div>
      `;
      const script = new EventTarget();
      makeOutletDefinitionsScript(script, ["user-status", "menu"]);
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
      });

      inspector.scan();

      await expect(
        inspector.controllerOutlets("host", "host"),
      ).resolves.toEqual({
        success: true,
        outlets: [
          { id: "status-el", tagName: "div", name: "user-status" },
          { id: "menu-el", tagName: "div", name: "menu" },
        ],
      });
    });

    it("uses an explicit outlet selector when the data-attribute is set", async () => {
      document.body.innerHTML = `
        <div
          id="host"
          data-controller="host"
          data-host-user-status-outlet="#status-via-id"
        >
          <div data-user-status data-controller="user-status"></div>
          <div id="status-via-id" data-controller="user-status-old"></div>
        </div>
      `;
      const script = new EventTarget();
      makeOutletDefinitionsScript(script, ["user-status"]);
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
      });

      inspector.scan();

      const response = await inspector.controllerOutlets("host", "host");

      expect(response).toEqual({
        success: true,
        outlets: [{ id: "status-via-id", tagName: "div", name: "user-status" }],
      });
    });

    it("returns an error when the element is not found", async () => {
      const inspector = new ContentInspector({ document, cssEscape });

      await expect(
        inspector.controllerOutlets("missing", "host"),
      ).resolves.toEqual({
        success: false,
        error: "Element not found",
      });
    });

    it("propagates request errors from the injected script", async () => {
      document.body.innerHTML = '<div id="host" data-controller="host"></div>';
      const script = new EventTarget();
      script.addEventListener(
        CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);

          script.dispatchEvent(
            new CustomEvent(CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: false,
                error: "Controller not found",
              }),
            }),
          );
        },
      );
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
      });

      inspector.scan();

      await expect(
        inspector.controllerOutlets("host", "host"),
      ).resolves.toEqual({
        requestId: expect.any(String),
        success: false,
        error: "Controller not found",
      });
    });

    it("uses fallback error text when the request rejects without a message", async () => {
      document.body.innerHTML = '<div id="host" data-controller="host"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.sendOutletDefinitionsRequest = async () => {
        throw new Error();
      };
      inspector.scan();

      await expect(
        inspector.controllerOutlets("host", "host"),
      ).resolves.toEqual({
        success: false,
        error: "Controller outlets failed",
      });
    });

    it("handles empty outlet attribute by falling back to default selector", async () => {
      document.body.innerHTML = `
        <div
          id="host"
          data-controller="host"
          data-host-menu-outlet=""
        >
          <nav data-controller="menu">Menu</nav>
        </div>
      `;
      const script = new EventTarget();
      makeOutletDefinitionsScript(script, ["menu"]);
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
      });

      inspector.scan();

      await expect(
        inspector.controllerOutlets("host", "host"),
      ).resolves.toEqual({
        success: true,
        outlets: [
          {
            id: expect.stringMatching(/^hotwire-inspector-/),
            tagName: "nav",
            name: "menu",
          },
        ],
      });
    });

    it("skips outlets whose default selector finds no matches", async () => {
      document.body.innerHTML = `
        <div
          id="host"
          data-controller="host"
          data-host-menu-outlet=""
        ></div>
      `;
      const script = new EventTarget();
      makeOutletDefinitionsScript(script, ["menu"]);
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript: () => Promise.resolve({ script }),
      });

      inspector.scan();

      await expect(
        inspector.controllerOutlets("host", "host"),
      ).resolves.toEqual({
        success: true,
        outlets: [],
      });
    });
  });

  describe("treeWatcher", () => {
    it("postTreeChanged sends the correct port message", () => {
      const fakePort = createFakeExtensionPort();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
      });

      inspector.postTreeChanged();

      expect(fakePort.postMessage).toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });

    it("startTreeWatcher initializes the TreeWatcher", () => {
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.startTreeWatcher();

      expect(inspector.treeWatcher).toBeInstanceOf(TreeWatcher);
      expect(FakeObserver).toHaveBeenCalledTimes(1);
    });

    it("startTreeWatcher pushes a tree-changed message when the DOM changes", async () => {
      await withFakeTimers(() => {
        const fakePort = createFakeExtensionPort();
        const FakeObserver = createFakeObserverClass();
        document.body.innerHTML = "<div></div>";
        const inspector = new ContentInspector({
          document,
          cssEscape,
          connectPort: () => fakePort,
          observerClass: FakeObserver,
        });

        inspector.startTreeWatcher();
        const observerInstance = FakeObserver._lastInstance();

        document.body.innerHTML =
          '<div data-controller="modal"><div data-modal-target="button"></div></div>';
        observerInstance._callback([{ type: "childList" }]);
        vi.advanceTimersByTime(100);

        expect(fakePort.postMessage).toHaveBeenCalledWith({
          type: TREE_CHANGED_PUSH_TYPE,
        });
      });
    });

    it("posts a tree-changed message on persisted pageshow", () => {
      const fakePort = createFakeExtensionPort();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
      });

      inspector.startPageLifecycleWatcher();
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      document.defaultView?.dispatchEvent(event);

      expect(fakePort.postMessage).toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });

    it("reconnects the events port before posting on persisted pageshow", () => {
      const firstPort = createFakeExtensionPort();
      const secondPort = createFakeExtensionPort();
      let callCount = 0;
      const connectPort = vi.fn(() =>
        callCount++ === 0 ? firstPort : secondPort,
      );
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort,
      });

      inspector.startPageLifecycleWatcher();
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      document.defaultView?.dispatchEvent(event);

      expect(firstPort.disconnect).toHaveBeenCalled();
      expect(secondPort.postMessage).toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });

    it("ignores pageshow when not persisted", () => {
      const fakePort = createFakeExtensionPort();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
      });

      inspector.startPageLifecycleWatcher();
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: false });
      document.defaultView?.dispatchEvent(event);

      expect(fakePort.postMessage).not.toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });

    it("is safe when the document has no default view", () => {
      const fakePort = createFakeExtensionPort();
      const disconnectedDocument = document.implementation.createHTMLDocument();
      const inspector = new ContentInspector({
        document: disconnectedDocument,
        cssEscape,
        connectPort: () => fakePort,
      });

      expect(() => inspector.startPageLifecycleWatcher()).not.toThrow();
      expect(fakePort.postMessage).not.toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });

    it("disconnect removes the pageshow listener", () => {
      const fakePort = createFakeExtensionPort();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
      });

      inspector.startPageLifecycleWatcher();
      inspector.disconnect();

      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      document.defaultView?.dispatchEvent(event);

      expect(fakePort.postMessage).not.toHaveBeenCalledWith({
        type: TREE_CHANGED_PUSH_TYPE,
      });
    });
  });

  describe("watchValues", () => {
    function createFakeTimeout() {
      /** @type {Array<{ fn: () => void, delay: number, cleared: boolean }>} */
      const pending = [];

      /** @type {typeof setTimeout} */
      const fakeSetTimeout = (fn, delay) => {
        const entry = { fn, delay, cleared: false };
        pending.push(entry);
        return /** @type {ReturnType<typeof setTimeout>} */ (entry);
      };

      const fakeClearTimeout = (id) => {
        const entry = /** @type {{ cleared: boolean } | null} */ (id);
        if (entry) entry.cleared = true;
      };

      return {
        fakeSetTimeout,
        fakeClearTimeout,
        pending,
        flush() {
          const entries = pending.splice(0).filter((e) => !e.cleared);
          for (const entry of entries) entry.fn();
        },
      };
    }

    function makeDefinitionsScript(script) {
      script.addEventListener(
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);
          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: true,
                definitions: [
                  {
                    name: "title",
                    type: "string",
                    defaultValue: "",
                    attributeName: "data-modal-title-value",
                  },
                ],
              }),
            }),
          );
        },
      );
    }

    function makeErrorDefinitionsScript(script, errorMessage) {
      script.addEventListener(
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        (event) => {
          const detail = JSON.parse(event.detail);
          script.dispatchEvent(
            new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT, {
              detail: JSON.stringify({
                requestId: detail.requestId,
                success: false,
                error: errorMessage,
              }),
            }),
          );
        },
      );
    }

    it("returns success and starts observing when element and definitions exist", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();

      const result = await inspector.watchValues("modal-controller", "modal");

      expect(result).toEqual({ success: true });
      expect(FakeObserver).toHaveBeenCalledTimes(1);
      expect(FakeObserver._lastInstance().observe).toHaveBeenCalled();
    });

    it("returns error when element is not found", async () => {
      const inspector = new ContentInspector({ document, cssEscape });

      const result = await inspector.watchValues("missing", "modal");

      expect(result).toEqual({
        success: false,
        error: "Element not found",
      });
    });

    it("returns error when definitions request fails", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const script = new EventTarget();
      makeErrorDefinitionsScript(script, "Controller not found");
      const injectScript = () => Promise.resolve({ script });
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
      });

      inspector.scan();

      const result = await inspector.watchValues("modal-controller", "modal");

      expect(result).toEqual({
        requestId: expect.any(String),
        success: false,
        error: "Controller not found",
      });
    });

    it("returns error when definitions request throws", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.sendValueDefinitionsRequest = async () => {
        throw new Error("Injected page script loader unavailable");
      };
      inspector.scan();

      const result = await inspector.watchValues("modal-controller", "modal");

      expect(result).toEqual({
        success: false,
        error: "Injected page script loader unavailable",
      });
    });

    it("uses fallback error text when definitions request throws without message", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal"></div>';
      const inspector = new ContentInspector({ document, cssEscape });

      inspector.sendValueDefinitionsRequest = async () => {
        throw new Error();
      };
      inspector.scan();

      const result = await inspector.watchValues("modal-controller", "modal");

      expect(result).toEqual({
        success: false,
        error: "Controller values failed",
      });
    });

    it("skips port connection when connectPort is not provided", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        observerClass: FakeObserver,
      });

      inspector.scan();

      const result = await inspector.watchValues("modal-controller", "modal");

      expect(result).toEqual({ success: true });
      expect(inspector.reconnectingPort).toBeNull();
    });

    it("replaces existing watch when called again", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      const firstObserver = FakeObserver._lastInstance();
      FakeObserver.mockClear();

      await inspector.watchValues("modal-controller", "modal");

      expect(firstObserver.disconnect).toHaveBeenCalled();
      expect(FakeObserver).toHaveBeenCalledTimes(1);
    });

    it("pushes values-changed message on attribute mutation", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      const observerInstance = FakeObserver._lastInstance();
      const element = document.querySelector("#modal-controller");

      element.setAttribute("data-modal-title-value", "World");
      observerInstance._callback();

      expect(fakePort.postMessage).toHaveBeenCalledWith({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "modal-controller",
        identifier: "modal",
        values: [
          {
            name: "title",
            type: "string",
            defaultValue: "",
            value: "World",
            hasValue: true,
          },
        ],
      });
    });

    it("suppresses push when values unchanged", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      const observerInstance = FakeObserver._lastInstance();
      const postMessageCallCount = fakePort.postMessage.mock.calls.length;

      observerInstance._callback();

      expect(fakePort.postMessage).toHaveBeenCalledTimes(postMessageCallCount);
    });

    it("unwatchValues stops watcher but keeps port alive", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      const observerInstance = FakeObserver._lastInstance();
      const result = inspector.unwatchValues();

      expect(result).toEqual({ success: true });
      expect(observerInstance.disconnect).toHaveBeenCalled();
      expect(fakePort.disconnect).not.toHaveBeenCalled();
      expect(inspector.activeWatcher).toBeNull();
      expect(inspector.reconnectingPort).not.toBeNull();
      expect(inspector.activeWatchTarget).toBeNull();
    });

    it("unwatchValues is idempotent", () => {
      const inspector = new ContentInspector({ document, cssEscape });

      const result = inspector.unwatchValues();

      expect(result).toEqual({ success: true });
    });

    it("disconnect() is safe when the tree watcher was never started", () => {
      const inspector = new ContentInspector({ document, cssEscape });

      expect(() => inspector.disconnect()).not.toThrow();
      expect(inspector.treeWatcher).toBeNull();
    });

    it("disconnect() tears down the tree watcher when it is active", () => {
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.startTreeWatcher();
      const observerInstance = FakeObserver._lastInstance();
      inspector.disconnect();

      expect(observerInstance.disconnect).toHaveBeenCalled();
      expect(inspector.treeWatcher).toBeNull();
    });

    it("disconnect() tears down the events port", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const fakePort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () => fakePort,
        observerClass: FakeObserver,
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      inspector.disconnect();

      expect(fakePort.disconnect).toHaveBeenCalled();
      expect(inspector.reconnectingPort).toBeNull();
    });

    it("port reconnects with backoff and re-pushes when watch is active", async () => {
      document.body.innerHTML =
        '<div id="modal-controller" data-controller="modal" data-modal-title-value="Hello"></div>';
      const script = new EventTarget();
      makeDefinitionsScript(script);
      const injectScript = () => Promise.resolve({ script });
      const firstPort = createFakeExtensionPort();
      const secondPort = createFakeExtensionPort();
      const FakeObserver = createFakeObserverClass();
      const timeout = createFakeTimeout();
      let connectPortCallCount = 0;
      const inspector = new ContentInspector({
        document,
        cssEscape,
        injectScript,
        connectPort: () =>
          connectPortCallCount++ === 0 ? firstPort : secondPort,
        observerClass: FakeObserver,
        createReconnectingPort: (opts) =>
          createReconnectingPort({
            ...opts,
            setTimeoutImpl: timeout.fakeSetTimeout,
            clearTimeoutImpl: timeout.fakeClearTimeout,
          }),
      });

      inspector.scan();
      await inspector.watchValues("modal-controller", "modal");

      firstPort._listeners.disconnect[0]();
      timeout.flush();

      expect(secondPort.postMessage).toHaveBeenCalledWith({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "modal-controller",
        identifier: "modal",
        values: [
          {
            name: "title",
            type: "string",
            defaultValue: "",
            value: "Hello",
            hasValue: true,
          },
        ],
      });
    });
  });
});
