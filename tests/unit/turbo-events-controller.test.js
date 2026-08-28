// @vitest-environment happy-dom

import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PANEL_BRIDGE_PROPERTY } from "../../lib/constants.js";
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

  beforeEach(async () => {
    elements = mountDom();
    document[PANEL_BRIDGE_PROPERTY] = {};

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

    controller.addEvent("turbo:load");
    await flushTargetLifecycle();

    expect(controller.eventTargets).toHaveLength(1);
    expect(getComputedStyle(elements.empty).display).toBe("none");
    expect(getComputedStyle(elements.list).display).not.toBe("none");
  });

  it("marks each event box as an `event` target", async () => {
    controller.addEvent("turbo:load");
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
      controller.createEventBox("turbo:load")
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
      controller.createEventBox("turbo:click")
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
      controller.createEventBox("turbo:visit")
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
      const box = controller.createEventBox(`turbo:event-${i}`);
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
      const box = controller.createEventBox(`turbo:event-${i}`);
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

    controller.addEvent("turbo:load");
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
    controller.addEvent("turbo:load");
    controller.addEvent("turbo:visit");
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
    const newBox = controller.createEventBox("turbo:visit");
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
    document[PANEL_BRIDGE_PROPERTY] = {};
  });

  afterEach(() => {
    if (app) app.stop();
    document.body.innerHTML = "";
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  it("connects and disconnects cleanly when no radios exist", async () => {
    app = Application.start();
    app.register("turbo-events", TurboEventsController);
    await flushTargetLifecycle();
    expect(() => app.stop()).not.toThrow();
  });
});
