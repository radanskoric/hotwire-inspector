// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import {
  TURBO_EVENT_NAMES,
  TurboEventWatcher,
  turboEventDetailsFor,
} from "../../lib/turbo-event-watcher.js";

function createDocumentSpy() {
  const addCalls = [];
  const removeCalls = [];

  return {
    document: {
      addEventListener(name, handler, options) {
        addCalls.push({ name, handler, options });
      },
      removeEventListener(name, handler, options) {
        removeCalls.push({ name, handler, options });
      },
    },
    addCalls,
    removeCalls,
  };
}

describe("TurboEventWatcher", () => {
  it("exports a curated Turbo 8.x event names", () => {
    // Do not match on everything to avoid an unneccarily brittle test
    expect(TURBO_EVENT_NAMES).toContain("turbo:click");
  });

  it("captures turbo:reload events with their reason", () => {
    const received = [];
    const watcher = new TurboEventWatcher({
      document,
      eventNames: TURBO_EVENT_NAMES,
      onEvent: (payload) => received.push(payload),
    });

    watcher.start();
    document.dispatchEvent(
      new CustomEvent("turbo:reload", { detail: "turbo_disabled" }),
    );
    watcher.stop();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      name: "turbo:reload",
      details: { reason: "turbo_disabled" },
    });
  });

  it("registers one capture-phase listener per name on start", () => {
    const spy = createDocumentSpy();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load", "turbo:render"],
      onEvent: () => {},
    });

    watcher.start();

    expect(spy.addCalls).toHaveLength(2);
    expect(spy.addCalls[0]).toMatchObject({
      name: "turbo:load",
      options: true,
    });
    expect(spy.addCalls[1]).toMatchObject({
      name: "turbo:render",
      options: true,
    });
    expect(watcher.started).toBe(true);
  });

  it("uses the same function reference for add and remove", () => {
    const spy = createDocumentSpy();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent: () => {},
    });

    watcher.start();
    watcher.stop();

    expect(spy.removeCalls).toHaveLength(1);
    expect(spy.removeCalls[0].handler).toBe(spy.addCalls[0].handler);
    expect(spy.removeCalls[0].options).toBe(true);
    expect(watcher.started).toBe(false);
  });

  it("stop is a no-op when never started", () => {
    const spy = createDocumentSpy();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent: () => {},
    });

    watcher.stop();

    expect(spy.removeCalls).toEqual([]);
    expect(watcher.started).toBe(false);
  });

  it("start is a no-op when called twice", () => {
    const spy = createDocumentSpy();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent: () => {},
    });

    watcher.start();
    watcher.start();

    expect(spy.addCalls).toHaveLength(1);
  });

  it("forwards the event name with Date.now() as the capture timestamp", () => {
    const spy = createDocumentSpy();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    /** @type {{ name: string, timestamp: number, details: Record<string, string> }[]} */
    const received = [];
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent: (payload) => received.push(payload),
    });

    watcher.start();
    const event = { type: "turbo:load", timeStamp: 12345 };
    spy.addCalls[0].handler(event);

    expect(received).toEqual([
      { name: "turbo:load", timestamp: 1700000000000, details: {} },
    ]);
    expect(nowSpy).toHaveBeenCalled();
  });

  it("uses Date.now() even when the captured event has no timeStamp", () => {
    const spy = createDocumentSpy();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const onEvent = vi.fn();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent,
    });

    watcher.start();
    spy.addCalls[0].handler({ type: "turbo:load", timeStamp: undefined });

    expect(onEvent).toHaveBeenCalledTimes(1);
    const payload = onEvent.mock.calls[0][0];
    expect(payload.name).toBe("turbo:load");
    expect(payload.timestamp).toBe(1700000000000);
    expect(nowSpy).toHaveBeenCalled();
  });

  it("forwards the original Event reference as the second argument to onEvent", () => {
    const spy = createDocumentSpy();
    const onEvent = vi.fn();
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent,
    });

    watcher.start();
    const event = { type: "turbo:load", timeStamp: 12345 };
    spy.addCalls[0].handler(event);

    expect(onEvent).toHaveBeenCalledWith(expect.any(Object), event);
  });

  it("start is safe when the supplied document is null", () => {
    const onEvent = vi.fn();
    const watcher = new TurboEventWatcher({
      document: null,
      eventNames: ["turbo:load"],
      onEvent,
    });

    expect(() => watcher.start()).not.toThrow();
    expect(watcher.started).toBe(false);
  });

  it("stop after start is safe when the supplied document is null", () => {
    const watcher = new TurboEventWatcher({
      // Forced into the "started" state without a real document so the
      // post-start null-document branch in stop() runs.
      document: null,
      eventNames: ["turbo:load"],
      onEvent: () => {},
    });
    watcher.started = true;

    expect(() => watcher.stop()).not.toThrow();
    expect(watcher.started).toBe(false);
  });
});

describe("turboEventDetailsFor", () => {
  it("extracts url from turbo:load event detail", () => {
    expect(
      turboEventDetailsFor("turbo:load", {
        detail: { url: "https://app.test/dashboard" },
      }),
    ).toEqual({ url: "https://app.test/dashboard" });
  });

  it("returns an empty object when the event is missing", () => {
    expect(turboEventDetailsFor("turbo:load", undefined)).toEqual({});
  });

  it("returns an empty object when detail is absent", () => {
    expect(turboEventDetailsFor("turbo:load", {})).toEqual({});
  });

  it("returns an empty object when url is an empty string", () => {
    expect(turboEventDetailsFor("turbo:load", { detail: { url: "" } })).toEqual(
      {},
    );
  });

  it("returns an empty object when url is not a string", () => {
    expect(
      turboEventDetailsFor("turbo:load", { detail: { url: 12345 } }),
    ).toEqual({});
  });

  it("returns an empty object for events with no rule", () => {
    expect(turboEventDetailsFor("turbo:render", { detail: {} })).toEqual({});
    expect(turboEventDetailsFor("turbo:visit", null)).toEqual({});
  });

  describe("document events", () => {
    it("extracts url from turbo:click detail", () => {
      expect(
        turboEventDetailsFor("turbo:click", { detail: { url: "/a" } }),
      ).toEqual({ url: "/a" });
    });

    it("omits an empty url from turbo:click detail", () => {
      expect(turboEventDetailsFor("turbo:click", { detail: {} })).toEqual({});
    });

    it("extracts url from turbo:before-visit detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-visit", {
          detail: { url: "https://app.test/x" },
        }),
      ).toEqual({ url: "https://app.test/x" });
    });

    it("omits an empty url from turbo:before-visit detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-visit", { detail: {} }),
      ).toEqual({});
    });

    it("extracts url and action from turbo:visit detail", () => {
      expect(
        turboEventDetailsFor("turbo:visit", {
          detail: { url: "/a", action: "advance" },
        }),
      ).toEqual({ url: "/a", action: "advance" });
    });

    it("drops empty entries from turbo:visit detail", () => {
      expect(
        turboEventDetailsFor("turbo:visit", { detail: { action: "replace" } }),
      ).toEqual({ action: "replace" });
    });

    it("ignores non-string action values on turbo:visit", () => {
      expect(
        turboEventDetailsFor("turbo:visit", {
          detail: { url: "/a", action: 42 },
        }),
      ).toEqual({ url: "/a" });
    });

    it("always returns an empty object for turbo:before-cache", () => {
      expect(
        turboEventDetailsFor("turbo:before-cache", { detail: { foo: "bar" } }),
      ).toEqual({});
    });

    it("extracts renderMethod from turbo:before-render detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-render", {
          detail: { renderMethod: "morph" },
        }),
      ).toEqual({ renderMethod: "morph" });
    });

    it("returns an empty object when turbo:before-render has no renderMethod", () => {
      expect(
        turboEventDetailsFor("turbo:before-render", { detail: {} }),
      ).toEqual({});
    });

    it("extracts renderMethod from turbo:render detail", () => {
      expect(
        turboEventDetailsFor("turbo:render", {
          detail: { renderMethod: "replace" },
        }),
      ).toEqual({ renderMethod: "replace" });
    });

    it("extracts reason from turbo:reload detail", () => {
      expect(
        turboEventDetailsFor("turbo:reload", {
          detail: { reason: "tracked_element_mismatch" },
        }),
      ).toEqual({ reason: "tracked_element_mismatch" });
    });

    it("extracts reason from turbo:reload's real string detail", () => {
      // Turbo dispatches `dispatch("turbo:reload", { detail: reason })` —
      // event.detail is the reason string itself, not a wrapper object.
      expect(
        turboEventDetailsFor("turbo:reload", { detail: "turbo_disabled" }),
      ).toEqual({ reason: "turbo_disabled" });
    });

    it("returns an empty object when turbo:reload has no reason", () => {
      expect(turboEventDetailsFor("turbo:reload", { detail: {} })).toEqual({});
    });
  });

  describe("morph attribute event", () => {
    it("extracts attributeName and mutationType from turbo:before-morph-attribute detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-morph-attribute", {
          detail: { attributeName: "data-open", mutationType: "updated" },
        }),
      ).toEqual({ attributeName: "data-open", mutationType: "updated" });
    });

    it("drops empty entries from turbo:before-morph-attribute", () => {
      expect(
        turboEventDetailsFor("turbo:before-morph-attribute", {
          detail: { mutationType: "added" },
        }),
      ).toEqual({ mutationType: "added" });
    });

    it("returns empty objects for morph events with no scalar surface", () => {
      expect(turboEventDetailsFor("turbo:morph", { detail: {} })).toEqual({});
      expect(
        turboEventDetailsFor("turbo:before-morph-element", {
          detail: { currentElement: {}, newElement: {} },
        }),
      ).toEqual({});
      expect(
        turboEventDetailsFor("turbo:morph-element", {
          detail: { newElement: {} },
        }),
      ).toEqual({});
    });
  });

  describe("form events", () => {
    function createFakeFormElement(action, method) {
      return {
        getAttribute(name) {
          if (name === "action") return action ?? null;
          if (name === "method") return method ?? null;
          return null;
        },
      };
    }

    it("extracts formAction and formMethod from turbo:submit-start detail", () => {
      expect(
        turboEventDetailsFor("turbo:submit-start", {
          detail: {
            formSubmission: {
              formElement: createFakeFormElement("/save", "post"),
            },
          },
        }),
      ).toEqual({ formAction: "/save", formMethod: "POST" });
    });

    it("uppercases the form method", () => {
      expect(
        turboEventDetailsFor("turbo:submit-start", {
          detail: {
            formSubmission: { formElement: createFakeFormElement("/x", "get") },
          },
        }),
      ).toEqual({ formAction: "/x", formMethod: "GET" });
    });

    it("omits empty formAction / formMethod entries", () => {
      expect(
        turboEventDetailsFor("turbo:submit-start", {
          detail: {
            formSubmission: {
              formElement: createFakeFormElement(null, "post"),
            },
          },
        }),
      ).toEqual({ formMethod: "POST" });
    });

    it("returns an empty object when turbo:submit-start has no formSubmission", () => {
      expect(
        turboEventDetailsFor("turbo:submit-start", { detail: {} }),
      ).toEqual({});
    });

    it("extracts success and error message from turbo:submit-end detail", () => {
      expect(
        turboEventDetailsFor("turbo:submit-end", {
          detail: {
            success: true,
            error: new Error("boom"),
          },
        }),
      ).toEqual({ success: "true", error: "boom" });
    });

    it("stringifies a non-Error submit-end error when no message is set", () => {
      expect(
        turboEventDetailsFor("turbo:submit-end", {
          detail: { success: false, error: "plain string reason" },
        }),
      ).toEqual({ success: "false", error: "plain string reason" });
    });

    it("drops empty entries from turbo:submit-end", () => {
      expect(
        turboEventDetailsFor("turbo:submit-end", {
          detail: { success: false },
        }),
      ).toEqual({ success: "false" });
    });

    it("returns an empty object when turbo:submit-end has no success or error", () => {
      expect(turboEventDetailsFor("turbo:submit-end", { detail: {} })).toEqual(
        {},
      );
    });
  });

  describe("frame events", () => {
    function createFakeFrame(src, id) {
      return {
        getAttribute(name) {
          if (name === "src") return src ?? null;
          return null;
        },
        id: id ?? "",
      };
    }

    it("extracts newFrameSrc and newFrameId from turbo:before-frame-render", () => {
      expect(
        turboEventDetailsFor("turbo:before-frame-render", {
          detail: { newFrame: createFakeFrame("/partial", "frame-1") },
        }),
      ).toEqual({ newFrameSrc: "/partial", newFrameId: "frame-1" });
    });

    it("drops empty newFrame entries when the newFrame has no src or id", () => {
      expect(
        turboEventDetailsFor("turbo:before-frame-render", {
          detail: { newFrame: createFakeFrame(null, "only-id") },
        }),
      ).toEqual({ newFrameId: "only-id" });
    });

    it("returns an empty object when turbo:before-frame-render has no newFrame", () => {
      expect(
        turboEventDetailsFor("turbo:before-frame-render", { detail: {} }),
      ).toEqual({});
    });

    it("extracts succeeded from turbo:frame-render detail", () => {
      expect(
        turboEventDetailsFor("turbo:frame-render", {
          detail: { fetchResponse: { succeeded: true } },
        }),
      ).toEqual({ succeeded: "true" });
    });

    it("drops an empty succeeded entry from turbo:frame-render", () => {
      expect(
        turboEventDetailsFor("turbo:frame-render", { detail: {} }),
      ).toEqual({});
    });

    it("always returns an empty object for turbo:frame-load", () => {
      expect(
        turboEventDetailsFor("turbo:frame-load", { detail: { foo: "bar" } }),
      ).toEqual({});
    });

    it("extracts url and status from turbo:frame-missing detail", () => {
      expect(
        turboEventDetailsFor("turbo:frame-missing", {
          detail: { response: { url: "/gone", status: 404 } },
        }),
      ).toEqual({ url: "/gone", status: "404" });
    });

    it("drops empty url/status entries from turbo:frame-missing", () => {
      expect(
        turboEventDetailsFor("turbo:frame-missing", {
          detail: { response: { status: 500 } },
        }),
      ).toEqual({ status: "500" });
    });

    it("drops undefined status when only url is set on turbo:frame-missing response", () => {
      expect(
        turboEventDetailsFor("turbo:frame-missing", {
          detail: { response: { url: "/gone" } },
        }),
      ).toEqual({ url: "/gone" });
    });

    it("returns an empty object when turbo:frame-missing has no response", () => {
      expect(
        turboEventDetailsFor("turbo:frame-missing", { detail: {} }),
      ).toEqual({});
    });
  });

  describe("stream events", () => {
    it("extracts action, target, and targets from turbo:before-stream-render detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-stream-render", {
          detail: {
            newStream: {
              action: "append",
              target: "messages",
              targets: "messages",
            },
          },
        }),
      ).toEqual({
        action: "append",
        target: "messages",
        targets: "messages",
      });
    });

    it("drops empty entries from turbo:before-stream-render detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-stream-render", {
          detail: { newStream: { action: "remove" } },
        }),
      ).toEqual({ action: "remove" });
    });

    it("returns an empty object when turbo:before-stream-render has no newStream", () => {
      expect(
        turboEventDetailsFor("turbo:before-stream-render", { detail: {} }),
      ).toEqual({});
    });
  });

  describe("fetch events", () => {
    it("extracts url and method from turbo:before-fetch-request detail", () => {
      const url = new URL("https://app.test/api/things");
      expect(
        turboEventDetailsFor("turbo:before-fetch-request", {
          detail: { url, fetchOptions: { method: "post" } },
        }),
      ).toEqual({ url: "https://app.test/api/things", method: "POST" });
    });

    it("stringifies a missing url to an empty entry that is dropped", () => {
      expect(
        turboEventDetailsFor("turbo:before-fetch-request", {
          detail: { fetchOptions: { method: "GET" } },
        }),
      ).toEqual({ method: "GET" });
    });

    it("returns an empty object when turbo:before-fetch-request has neither url nor method", () => {
      expect(
        turboEventDetailsFor("turbo:before-fetch-request", { detail: {} }),
      ).toEqual({});
    });

    it("extracts succeeded from turbo:before-fetch-response detail", () => {
      expect(
        turboEventDetailsFor("turbo:before-fetch-response", {
          detail: { fetchResponse: { succeeded: false } },
        }),
      ).toEqual({ succeeded: "false" });
    });

    it("drops empty succeeded from turbo:before-fetch-response", () => {
      expect(
        turboEventDetailsFor("turbo:before-fetch-response", { detail: {} }),
      ).toEqual({});
    });

    it("extracts error message from turbo:fetch-request-error detail", () => {
      expect(
        turboEventDetailsFor("turbo:fetch-request-error", {
          detail: { error: new Error("network down") },
        }),
      ).toEqual({ error: "network down" });
    });

    it("stringifies a non-Error fetch-request-error fallback", () => {
      expect(
        turboEventDetailsFor("turbo:fetch-request-error", {
          detail: { error: "string-only" },
        }),
      ).toEqual({ error: "string-only" });
    });

    it("returns an empty object when turbo:fetch-request-error has no error", () => {
      expect(
        turboEventDetailsFor("turbo:fetch-request-error", { detail: {} }),
      ).toEqual({});
    });
  });

  describe("prefetch event", () => {
    it("reads href from event.target when target exposes getAttribute", () => {
      const target = {
        getAttribute(name) {
          return name === "href" ? "/preview" : null;
        },
      };
      expect(
        turboEventDetailsFor("turbo:before-prefetch", {
          target,
          detail: null,
        }),
      ).toEqual({ href: "/preview" });
    });

    it("returns an empty object when there is no target", () => {
      expect(
        turboEventDetailsFor("turbo:before-prefetch", { detail: null }),
      ).toEqual({});
    });

    it("returns an empty object when target has no href", () => {
      const target = { getAttribute: () => null };
      expect(
        turboEventDetailsFor("turbo:before-prefetch", {
          target,
          detail: null,
        }),
      ).toEqual({});
    });
  });

  describe("catch-all", () => {
    it("returns an empty object for events without a rule", () => {
      expect(turboEventDetailsFor("turbo:frame-click", { detail: {} })).toEqual(
        {},
      );
    });
  });
});

describe("TurboEventWatcher details", () => {
  it("threads details extracted from the captured event into the payload", () => {
    const spy = createDocumentSpy();
    /** @type {{ name: string, details: Record<string, string> }[]} */
    const received = [];
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:load"],
      onEvent: (payload) => received.push(payload),
    });

    watcher.start();
    spy.addCalls[0].handler({
      type: "turbo:load",
      timeStamp: 12345,
      detail: { url: "https://app.test/x" },
    });

    expect(received).toHaveLength(1);
    expect(received[0].details).toEqual({ url: "https://app.test/x" });
  });

  it("threads an empty details record for events with no rule", () => {
    const spy = createDocumentSpy();
    /** @type {{ name: string, details: Record<string, string> }[]} */
    const received = [];
    const watcher = new TurboEventWatcher({
      document: spy.document,
      eventNames: ["turbo:render"],
      onEvent: (payload) => received.push(payload),
    });

    watcher.start();
    spy.addCalls[0].handler({
      type: "turbo:render",
      timeStamp: 12345,
      detail: {},
    });

    expect(received[0].details).toEqual({});
  });
});
