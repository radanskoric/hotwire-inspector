// @vitest-environment happy-dom

import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PANEL_BRIDGE_PROPERTY,
  TURBO_EVENT_PUSH_TYPE,
} from "../../lib/constants.js";
import { TurboEventsController } from "../../lib/panel/controllers/turbo-events-controller.js";

const MAX_EVENTS_DEFAULT = 500;

// The empty-state placeholder and list visibility are pure CSS (`:empty` +
// adjacent-sibling combinator); unit tests inject the relevant rules so
// `getComputedStyle` reports the same display value the real stylesheet
// would in the browser.
const EVENTS_PANEL_CSS = `
  .events-dropped-notice { display: none; }
  .events-list:not(:empty) {
    display: flex;
    flex: 1;
    min-block-size: 0;
    overflow-y: auto;
  }
  .events-list:empty { display: none; }
  .events-empty {
    display: none;
    flex: 1;
    min-block-size: 0;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 1.5rem 3rem;
    color: var(--color-ink-muted);
    text-align: center;
  }
  .events-list:empty + .events-empty { display: flex; }
`;

function mountDom() {
  document.body.innerHTML = `
    <fieldset class="tab-switcher">
      <legend class="visually-hidden">View</legend>
      <input
        type="radio"
        name="panel-tab"
        id="tab-elements"
        class="tab-input"
        checked
      />
      <label class="tab" for="tab-elements">Hotwire Elements</label>
      <input type="radio" name="panel-tab" id="tab-events" class="tab-input" />
      <label class="tab" for="tab-events">Turbo Events</label>
    </fieldset>
    <section
      id="panel-events"
      class="tab-panel"
      data-controller="turbo-events"
    >
      <div class="events-header">
        <a
          href="#"
          class="events-clear"
          data-turbo-events-target="clear"
          data-action="click->turbo-events#clear:prevent"
        >Clear</a>
      </div>
      <p
        class="events-dropped-notice"
        data-turbo-events-target="droppedNotice"
        hidden
      ></p>
      <div
        class="events-list"
        data-turbo-events-target="list"
        role="log"
        aria-live="polite"
      ></div>
      <p class="events-empty">No Turbo events yet</p>
    </section>
  `;
  const style = document.createElement("style");
  style.textContent = EVENTS_PANEL_CSS;
  document.head.appendChild(style);

  return {
    section: document.getElementById("panel-events"),
    list: document.querySelector(".events-list"),
    notice: document.querySelector(".events-dropped-notice"),
    empty: document.querySelector(".events-empty"),
    clear: document.querySelector(".events-clear"),
  };
}

function activateEventsTab() {
  const radio = document.getElementById("tab-events");
  const elementsRadio = document.getElementById("tab-elements");
  elementsRadio.checked = false;
  radio.checked = true;
  radio.dispatchEvent(new Event("change"));
}

/**
 * @returns {{
 *   bridge: {
 *     onTurboEvent: (cb: (push: { name: string, timestamp: number }) => void) => void,
 *     offTurboEvent: () => void,
 *     _onTurboEvent: ((push: { name: string, timestamp: number }) => void) | null
 *   }
 * }}
 */
function createStubBridge() {
  const bridge = {
    /** @type {((push: { name: string, timestamp: number }) => void) | null} */
    _onTurboEvent: null,
    onTurboEvent(callback) {
      this._onTurboEvent = callback;
    },
    offTurboEvent() {
      this._onTurboEvent = null;
    },
  };
  return { bridge };
}

/**
 * Settles a few Stimulus target-lifecycle ticks. addEvent appends a
 * `.event-box`; Stimulus dispatches `eventTargetConnected` (and any
 * `eventTargetDisconnected` for trims done inline) asynchronously via
 * its MutationObserver, so we wait several microtasks before reading
 * controller state.
 */
async function flushTargetLifecycle() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/**
 * @param {Element} element
 * @param {number} bottom
 */
function stubRectBottom(element, bottom) {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom,
    width: 0,
    height: 0,
  });
}

/**
 * Replaces `scrollHeight` and `clientHeight` so the controller's
 * `scrollToBottom` has the metrics it expects.
 *
 * @param {HTMLElement} list
 * @param {object} metrics
 * @param {number} metrics.scrollHeight
 * @param {number} metrics.clientHeight
 */
function setScrollMetrics(list, { scrollHeight, clientHeight }) {
  Object.defineProperty(list, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(list, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

describe("TurboEventsController", () => {
  /** @type {Application} */
  let application;
  /** @type {ReturnType<typeof mountDom>} */
  let elements;
  /** @type {TurboEventsController} */
  let controller;
  /** @type {ReturnType<typeof createStubBridge>["bridge"]} */
  let bridge;

  beforeEach(async () => {
    elements = mountDom();
    ({ bridge } = createStubBridge());
    document[PANEL_BRIDGE_PROPERTY] = bridge;

    application = Application.start();
    application.register("turbo-events", TurboEventsController);
    await flushTargetLifecycle();

    controller = /** @type {TurboEventsController} */ (
      application.getControllerForElementAndIdentifier(
        elements.section,
        "turbo-events",
      )
    );
  });

  afterEach(() => {
    application.stop();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete document[PANEL_BRIDGE_PROPERTY];
    vi.restoreAllMocks();
  });

  it("starts with an empty list and shows the empty placeholder", () => {
    expect(controller.eventTargets).toHaveLength(0);
    expect(elements.list.children).toHaveLength(0);
    expect(controller.droppedCountValue).toBe(0);
    expect(elements.empty.textContent).toContain("No Turbo events");
    expect(elements.notice.hidden).toBe(true);
    expect(getComputedStyle(elements.empty).display).toBe("flex");
    expect(getComputedStyle(elements.list).display).toBe("none");
  });

  it("hides the empty placeholder when the first event arrives", async () => {
    expect(getComputedStyle(elements.empty).display).toBe("flex");

    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(1);
    expect(getComputedStyle(elements.empty).display).toBe("none");
    expect(getComputedStyle(elements.list).display).not.toBe("none");
  });

  it("marks each event box as an `event` target", async () => {
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    for (const target of controller.eventTargets) {
      expect(target.getAttribute("data-turbo-events-target")).toBe("event");
    }
  });

  it("removes its tab-change listener on disconnect", () => {
    const radio = document.getElementById("tab-events");
    controller.disconnect();

    // Sanity check: dispatching the change event no longer triggers autoscroll.
    elements.list.scrollTop = 0;
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    expect(elements.list.scrollTop).toBe(0);
  });

  it("tolerates a second disconnect when the listeners have already been removed", () => {
    controller.disconnect();
    expect(() => controller.disconnect()).not.toThrow();
    expect(controller.abortController).toBeNull();
  });

  it("autoscrolls when the last event target is at the list's bottom edge", async () => {
    activateEventsTab();

    stubRectBottom(elements.list, 100);
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });

    const newBox = /** @type {HTMLElement} */ (
      controller.createEventBox({
        type: TURBO_EVENT_PUSH_TYPE,
        name: "turbo:load",
        timestamp: 1700000000000,
        targetId: null,
      })
    );
    stubRectBottom(newBox, 100);

    controller.listTarget.appendChild(newBox);
    await flushTargetLifecycle();

    expect(elements.list.scrollTop).toBe(100);
  });

  it("autoscrolls when the last event target lands within the threshold of the list bottom", async () => {
    activateEventsTab();

    stubRectBottom(elements.list, 100);
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });

    // event bottom = 98 → distance = 2 (≤ 4 threshold).
    const newBox = /** @type {HTMLElement} */ (
      controller.createEventBox({
        type: TURBO_EVENT_PUSH_TYPE,
        name: "turbo:click",
        timestamp: 1700000000000,
        targetId: null,
      })
    );
    stubRectBottom(newBox, 98);

    controller.listTarget.appendChild(newBox);
    await flushTargetLifecycle();

    expect(elements.list.scrollTop).toBe(100);
  });

  it("does not autoscroll when the last event target is below the list bottom", async () => {
    activateEventsTab();

    stubRectBottom(elements.list, 100);
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });

    // distance = -20 (|distance| > 4) — user has scrolled up.
    const newBox = /** @type {HTMLElement} */ (
      controller.createEventBox({
        type: TURBO_EVENT_PUSH_TYPE,
        name: "turbo:visit",
        timestamp: 1700000000000,
        targetId: null,
      })
    );
    stubRectBottom(newBox, 120);

    controller.listTarget.appendChild(newBox);
    await flushTargetLifecycle();

    expect(elements.list.scrollTop).toBe(0);
  });

  it("trims overflow and increments droppedCountValue past the cap", async () => {
    activateEventsTab();

    stubRectBottom(elements.list, 1000);
    setScrollMetrics(elements.list, { scrollHeight: 1000, clientHeight: 100 });

    // 0 initial + 505 added = 505 → trim 5 at cap 500.
    for (let i = 0; i < MAX_EVENTS_DEFAULT + 5; i += 1) {
      const box = controller.createEventBox({
        type: TURBO_EVENT_PUSH_TYPE,
        name: `turbo:event-${i}`,
        timestamp: i,
        targetId: null,
      });
      stubRectBottom(box, 1000);
      controller.listTarget.appendChild(box);
    }
    await flushTargetLifecycle();

    expect(controller.eventTargets.length).toBe(MAX_EVENTS_DEFAULT);
    expect(controller.droppedCountValue).toBe(5);
    expect(elements.notice.hidden).toBe(false);
    expect(elements.notice.textContent).toBe(
      "5 older events have been dropped",
    );
    // Once there are events, the empty placeholder stays hidden.
    expect(getComputedStyle(elements.empty).display).toBe("none");
    expect(getComputedStyle(elements.list).display).not.toBe("none");
  });

  it("reflects the current droppedCountValue in the notice", async () => {
    activateEventsTab();

    stubRectBottom(elements.list, 1000);
    setScrollMetrics(elements.list, { scrollHeight: 1000, clientHeight: 100 });

    // 0 + 502 = 502 → trim 2.
    for (let i = 0; i < MAX_EVENTS_DEFAULT + 2; i += 1) {
      const box = controller.createEventBox({
        type: TURBO_EVENT_PUSH_TYPE,
        name: `turbo:event-${i}`,
        timestamp: i,
        targetId: null,
      });
      stubRectBottom(box, 1000);
      controller.listTarget.appendChild(box);
    }
    await flushTargetLifecycle();

    expect(elements.notice.textContent).toBe(
      "2 older events have been dropped",
    );
  });

  it("drops the count when the cap evicts the freshly arrived event", async () => {
    activateEventsTab();

    // A cap of 0 evicts every event on arrival, so the list is empty
    // after a single addEvent and the dropped-notice carries the count.
    controller.maxEventsValue = 0;
    stubRectBottom(elements.list, 100);
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });

    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    expect(controller.droppedCountValue).toBe(1);
    expect(elements.notice.hidden).toBe(false);
    expect(elements.notice.textContent).toBe(
      "1 older events have been dropped",
    );
    // With CSS-driven visibility, an empty list shows the placeholder
    // even when drops > 0 — the notice sits above it.
    expect(getComputedStyle(elements.empty).display).toBe("flex");
    expect(getComputedStyle(elements.list).display).toBe("none");
  });

  it("shows the empty placeholder again after replaceChildren empties the list", async () => {
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:visit",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();
    expect(getComputedStyle(elements.empty).display).toBe("none");

    // Detach every event box manually.
    elements.list.replaceChildren();
    await flushTargetLifecycle();

    expect(getComputedStyle(elements.empty).display).toBe("flex");
    expect(getComputedStyle(elements.list).display).toBe("none");
    // Manual teardown isn't a "drop" — the count only ticks when the
    // cap causes `eventTargetConnected` to evict older events.
    expect(controller.droppedCountValue).toBe(0);
  });

  it("defers autoscroll while the events tab is hidden and catches up once shown", async () => {
    stubRectBottom(elements.list, 1000);
    setScrollMetrics(elements.list, { scrollHeight: 1000, clientHeight: 100 });

    // Elements tab is the default; events tab is unchecked.
    const newBox = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:visit",
      timestamp: 1700000000000,
      targetId: null,
    });
    stubRectBottom(newBox, 120);
    controller.listTarget.appendChild(newBox);

    await flushTargetLifecycle();
    expect(controller.shouldScrollOnNextShow).toBe(true);
    expect(elements.list.scrollTop).toBe(0);

    activateEventsTab();

    expect(elements.list.scrollTop).toBe(1000);
  });

  it("no-ops maybeAutoscroll when the tab change handler fires with nothing to do", () => {
    activateEventsTab();
    expect(() => controller.maybeAutoscroll()).not.toThrow();
  });

  it("subscribes to bridge turbo-event pushes on connect", () => {
    expect(bridge._onTurboEvent).toBeTypeOf("function");
  });

  it("unsubscribes from bridge turbo-event pushes on disconnect", () => {
    expect(bridge._onTurboEvent).toBeTypeOf("function");

    controller.disconnect();

    expect(bridge._onTurboEvent).toBeNull();
  });

  it("does not render events dispatched after disconnect", async () => {
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 0,
      targetId: null,
    });
    await flushTargetLifecycle();
    const countBeforeDisconnect = controller.eventTargets.length;

    controller.disconnect();
    expect(() =>
      bridge._onTurboEvent?.({
        type: TURBO_EVENT_PUSH_TYPE,
        name: "turbo:render",
        timestamp: 0,
        targetId: null,
      }),
    ).not.toThrow();

    await flushTargetLifecycle();
    expect(controller.eventTargets.length).toBe(countBeforeDisconnect);
  });

  it("appends an event box from a bridge push payload", async () => {
    expect(controller.eventTargets).toHaveLength(0);

    bridge._onTurboEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(1);
    const [box] = controller.eventTargets;
    expect(box.getAttribute("data-turbo-events-target")).toBe("event");
    expect(box.querySelector(".event-name").textContent).toBe("turbo:load");
  });

  it("renders the push timestamp as a localised time-of-day string", async () => {
    const timestamp = 1700000000000;
    bridge._onTurboEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp,
      targetId: null,
    });
    await flushTargetLifecycle();

    const [box] = controller.eventTargets;
    const expected = new Intl.DateTimeFormat(undefined, {
      timeStyle: "medium",
    }).format(new Date(timestamp));
    expect(box.querySelector(".event-time").textContent).toBe(expected);
  });

  it("createEventBox renders the formatted capture time from the push", () => {
    const timestamp = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(timestamp);

    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp,
      targetId: null,
    });

    expect(box.querySelector(".event-name").textContent).toBe("turbo:load");
    const expected = new Intl.DateTimeFormat(undefined, {
      timeStyle: "medium",
    }).format(new Date(timestamp));
    expect(box.querySelector(".event-time").textContent).toBe(expected);
  });

  it("continues appending events across many bridge pushes", async () => {
    activateEventsTab();
    stubRectBottom(elements.list, 1000);
    setScrollMetrics(elements.list, { scrollHeight: 1000, clientHeight: 100 });

    for (let i = 0; i < 5; i += 1) {
      bridge._onTurboEvent({
        type: TURBO_EVENT_PUSH_TYPE,
        name: `turbo:event-${i}`,
        timestamp: i,
        targetId: null,
      });
    }
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(5);
    expect(
      controller.eventTargets.map(
        (target) => target.querySelector(".event-name").textContent,
      ),
    ).toEqual([
      "turbo:event-0",
      "turbo:event-1",
      "turbo:event-2",
      "turbo:event-3",
      "turbo:event-4",
    ]);
  });

  it("respects the cap and dropped notice under push bursts", async () => {
    activateEventsTab();
    stubRectBottom(elements.list, 1000);
    setScrollMetrics(elements.list, { scrollHeight: 1000, clientHeight: 100 });

    // 0 initial + 505 pushes = 505 → trim 5 at cap 500.
    for (let i = 0; i < MAX_EVENTS_DEFAULT + 5; i += 1) {
      stubRectBottom(
        controller.createEventBox({
          type: TURBO_EVENT_PUSH_TYPE,
          name: `turbo:event-${i}`,
          timestamp: i,
          targetId: null,
        }),
        1000,
      );
      bridge._onTurboEvent({
        type: TURBO_EVENT_PUSH_TYPE,
        name: `turbo:event-${i}`,
        timestamp: i,
        targetId: null,
      });
    }
    await flushTargetLifecycle();

    expect(controller.eventTargets.length).toBe(MAX_EVENTS_DEFAULT);
    expect(controller.droppedCountValue).toBe(5);
    expect(elements.notice.hidden).toBe(false);
    expect(elements.notice.textContent).toBe(
      "5 older events have been dropped",
    );
  });

  it("re-subscribes to the bridge on a fresh application start", async () => {
    application.stop();
    expect(bridge._onTurboEvent).not.toBeNull();

    const resetBridge = createStubBridge().bridge;
    document[PANEL_BRIDGE_PROPERTY] = resetBridge;

    application = Application.start();
    application.register("turbo-events", TurboEventsController);
    await flushTargetLifecycle();

    controller = /** @type {TurboEventsController} */ (
      application.getControllerForElementAndIdentifier(
        elements.section,
        "turbo-events",
      )
    );

    expect(resetBridge._onTurboEvent).toBeTypeOf("function");
  });

  it("renders a reveal icon when the push carries a targetId", async () => {
    bridge._onTurboEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:render",
      timestamp: 1700000000000,
      targetId: "frame-id",
    });
    await flushTargetLifecycle();

    const [box] = controller.eventTargets;
    const reveal = box.querySelector(".event-reveal");
    expect(reveal).not.toBeNull();
    expect(reveal.getAttribute("data-controller")).toBe("event-box");
    expect(reveal.getAttribute("data-event-box-target-id-value")).toBe(
      "frame-id",
    );
    expect(reveal.getAttribute("data-action")).toBe("click->event-box#inspect");
    expect(reveal.getAttribute("src")).toBe("/icons/reveal-in-elements.svg");
  });

  it("does not render a reveal icon when the push omits targetId", async () => {
    bridge._onTurboEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:render",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    const [box] = controller.eventTargets;
    expect(box.querySelector(".event-reveal")).toBeNull();
  });

  it("createEventBox with a targetId produces a reveal icon with the configured target id", () => {
    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:render",
      timestamp: 1700000000000,
      targetId: "main-frame",
    });

    const reveal = box.querySelector(".event-reveal");
    expect(reveal).not.toBeNull();
    expect(reveal.getAttribute("data-event-box-target-id-value")).toBe(
      "main-frame",
    );
  });

  it("createEventBox without a targetId omits the reveal icon", () => {
    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:render",
      timestamp: 1700000000000,
      targetId: null,
      details: {},
    });

    expect(box.querySelector(".event-reveal")).toBeNull();
  });

  it("createEventBox omits details block when details is empty", () => {
    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:render",
      timestamp: 1700000000000,
      targetId: null,
      details: {},
    });

    expect(box.querySelector(".event-box-details")).toBeNull();
  });

  it("createEventBox renders a closed details block when details has entries", () => {
    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
      details: { url: "https://app.test/dashboard" },
    });

    const details = box.querySelector(".event-box-details");
    expect(details).not.toBeNull();
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.hasAttribute("open")).toBe(false);

    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toBe("Details");

    const grid = details?.querySelector(".event-box-details-grid");
    expect(grid?.tagName).toBe("DL");

    const key = details?.querySelector(".event-box-details-key");
    expect(key?.tagName).toBe("DT");
    expect(key?.textContent).toBe("url");
    expect(key?.classList.contains("event-box-details-key")).toBe(true);

    const value = details?.querySelector(".event-box-details-value");
    expect(value?.tagName).toBe("DD");
    expect(value?.textContent).toBe("https://app.test/dashboard");
  });

  it("createEventBox renders one row per detail when details has multiple keys", () => {
    const box = controller.createEventBox({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
      details: {
        url: "https://app.test/dashboard",
        frame: "main",
      },
    });

    const details = /** @type {HTMLElement} */ (
      box.querySelector(".event-box-details")
    );
    const rows = details.querySelectorAll(".event-box-details-grid > dt");
    expect(rows).toHaveLength(2);

    const keys = Array.from(rows).map((dt) => dt.textContent);
    expect(keys).toEqual(["url", "frame"]);

    const values = Array.from(
      /** @type {NodeListOf<HTMLElement>} */ (
        details.querySelectorAll(".event-box-details-grid > dd")
      ),
    ).map((dd) => dd.textContent);
    expect(values).toEqual(["https://app.test/dashboard", "main"]);
  });

  it("bridge-driven push with details renders a closed details block", async () => {
    bridge._onTurboEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
      details: { url: "https://app.test/x" },
    });
    await flushTargetLifecycle();

    const [box] = controller.eventTargets;
    const details = box.querySelector(".event-box-details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector(".event-box-details-value").textContent).toBe(
      "https://app.test/x",
    );
  });

  it("exposes the clear target so a click handler can be wired to it", () => {
    expect(controller.clearTarget).toBe(elements.clear);
  });

  it("clear() empties the events list without affecting a separate droppedCount", async () => {
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:visit",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(2);
    expect(getComputedStyle(elements.empty).display).toBe("none");

    controller.clear();

    expect(controller.eventTargets).toHaveLength(0);
    expect(elements.list.children).toHaveLength(0);
    // Manual teardown isn't a "drop" — the count only ticks when the
    // cap causes `eventTargetConnected` to evict older events.
    expect(controller.droppedCountValue).toBe(0);
    expect(elements.notice.hidden).toBe(true);
    // CSS-driven visibility: an emptied list shows the placeholder again.
    expect(getComputedStyle(elements.empty).display).toBe("flex");
    expect(getComputedStyle(elements.list).display).toBe("none");
  });

  it("clear() resets a non-zero droppedCountValue and hides the dropped notice", async () => {
    activateEventsTab();
    stubRectBottom(elements.list, 100);
    setScrollMetrics(elements.list, { scrollHeight: 100, clientHeight: 100 });

    // Cap of 0 evicts every event on arrival → droppedCountValue = 1.
    controller.maxEventsValue = 0;
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();
    expect(controller.droppedCountValue).toBe(1);
    expect(elements.notice.hidden).toBe(false);

    controller.clear();
    await flushTargetLifecycle();

    expect(controller.droppedCountValue).toBe(0);
    expect(elements.notice.hidden).toBe(true);
  });

  it("clicking the clear link empties the events list through the Stimulus action", async () => {
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:load",
      timestamp: 1700000000000,
      targetId: null,
    });
    controller.addEvent({
      type: TURBO_EVENT_PUSH_TYPE,
      name: "turbo:visit",
      timestamp: 1700000000000,
      targetId: null,
    });
    await flushTargetLifecycle();
    expect(controller.eventTargets).toHaveLength(2);

    elements.clear.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(0);
    expect(elements.list.children).toHaveLength(0);
    expect(controller.droppedCountValue).toBe(0);
    expect(getComputedStyle(elements.empty).display).toBe("flex");
  });
});

describe("TurboEventsController without tab radio wiring", () => {
  /** @type {Application} */
  let app;

  beforeEach(() => {
    document.body.innerHTML = `<section
      id="panel-events"
      class="tab-panel"
      data-controller="turbo-events"
    >
      <div class="events-header">
        <a
          href="#"
          class="events-clear"
          data-turbo-events-target="clear"
          data-action="click->turbo-events#clear:prevent"
        >Clear</a>
      </div>
      <p
        class="events-dropped-notice"
        data-turbo-events-target="droppedNotice"
        hidden
      ></p>
      <div
        class="events-list"
        data-turbo-events-target="list"
        role="log"
        aria-live="polite"
      ></div>
      <p class="events-empty">No Turbo events yet</p>
    </section>`;
    ({ bridge: document[PANEL_BRIDGE_PROPERTY] } = createStubBridge());
  });

  afterEach(() => {
    if (app) app.stop();
    document.body.innerHTML = "";
    delete document[PANEL_BRIDGE_PROPERTY];
    vi.restoreAllMocks();
  });

  it("connects and disconnects cleanly when no radios exist", async () => {
    app = Application.start();
    app.register("turbo-events", TurboEventsController);
    await flushTargetLifecycle();
    expect(() => app.stop()).not.toThrow();
  });
});
