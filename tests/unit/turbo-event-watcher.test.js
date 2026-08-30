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
