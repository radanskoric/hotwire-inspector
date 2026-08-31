import { PanelController } from "./panel-controller.js";

const AUTOSCROLL_THRESHOLD_PX = 4;
const RADIO_NAME = "panel-tab";
const EVENTS_TAB_ID = "tab-events";

/**
 * @param {Date} date
 * @returns {string}
 */
function formatEventTime(date) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(
    date,
  );
}

/**
 * @typedef {TurboEventsController & {
 *   listTarget: HTMLElement,
 *   clearTarget: HTMLElement,
 *   droppedNoticeTarget: HTMLElement,
 *   eventTargets: HTMLElement[],
 *   maxEventsValue: number,
 *   droppedCountValue: number,
 *   abortController: AbortController | null,
 *   shouldScrollOnNextShow: boolean,
 * }} TurboEventsControllerWithTargets
 */

/**
 * Renders the Turbo Events timeline. Owns the events-list DOM, the
 * dropped-events notice, the autoscroll logic, and the bridge
 * subscription that feeds live Turbo events from the content script.
 *
 * Each `.event-box` is its own Stimulus target; `eventTargetConnected`
 * handles trim-to-cap and the dropped-count bookkeeping in one place.
 * The empty-state placeholder is purely CSS-driven via `:empty`.
 */
export class TurboEventsController extends PanelController {
  static targets = ["list", "clear", "droppedNotice", "event"];

  static values = {
    maxEvents: { type: Number, default: 500 },
    droppedCount: { type: Number, default: 0 },
  };

  /** @this {TurboEventsControllerWithTargets} */
  connect() {
    this.shouldScrollOnNextShow = false;
    this.abortController = new AbortController();
    for (const input of this.element.ownerDocument.querySelectorAll(
      `input[name="${RADIO_NAME}"]`,
    )) {
      input.addEventListener("change", () => this.maybeAutoscroll(), {
        signal: this.abortController.signal,
      });
    }
    this.bridge.onTurboEvent(
      (/** @type {import("../../types.js").TurboEventPush} */ push) =>
        this.addEvent(push),
    );
  }

  /** @this {TurboEventsControllerWithTargets} */
  disconnect() {
    this.abortController?.abort();
    this.abortController = null;
    this.bridge.offTurboEvent();
  }

  /**
   * Clears all saved Turbo events and resets the dropped count.
   * Removes all event boxes from the list and resets
   * droppedCountValue to 0, which hides the dropped notice
   * and shows the "No Turbo events yet" placeholder via CSS.
   *
   * @this {TurboEventsControllerWithTargets}
   */
  clear() {
    this.listTarget.replaceChildren();
    this.droppedCountValue = 0;
  }

  /**
   * The Stimulus `event` target lifecycle takes over from here —
   * trimming, dropped-count bookkeeping, and autoscroll all run from
   * `eventTargetConnected`.
   *
   * @param {import("../../types.js").TurboEventPush} push
   * @this {TurboEventsControllerWithTargets}
   */
  addEvent(push) {
    this.listTarget.appendChild(this.createEventBox(push));
  }

  /**
   * Trim to the cap, bump the dropped counter, and trigger autoscroll —
   * all happen here, on the connect callback, so the bookkeeping is
   * independent of MutationObserver delivery timing. (A disconnect-based
   * bookkeeping would be cleaner stylistically, but happy-dom batches
   * the trim's removeChild into the next MO delivery without ever
   * surfacing a disconnect callback, which made it untestable in unit
   * tests.)
   *
   * @param {HTMLElement} element
   * @this {TurboEventsControllerWithTargets}
   */
  eventTargetConnected(element) {
    const excess = Math.max(0, this.eventTargets.length - this.maxEventsValue);
    for (let i = 0; i < excess; i += 1) {
      this.eventTargets[0]?.remove();
    }
    if (excess > 0) {
      this.droppedCountValue += excess;
    }
    this.maybeAutoscroll(element);
  }

  /**
   * Fires once on connect with the default (0) and whenever the value
   * changes — sole owner of the dropped-notice visibility + text.
   *
   * @this {TurboEventsControllerWithTargets}
   */
  droppedCountValueChanged() {
    const dropped = this.droppedCountValue;
    this.droppedNoticeTarget.hidden = dropped === 0;
    if (dropped > 0) {
      this.droppedNoticeTarget.textContent = `${dropped} older events have been dropped`;
    }
  }

  /**
   * @param {HTMLElement | undefined} [element]
   * @this {TurboEventsControllerWithTargets}
   */
  maybeAutoscroll(element) {
    if (!this.isEventsTabActive()) {
      this.shouldScrollOnNextShow = true;
      return;
    }

    if (this.shouldScrollOnNextShow) {
      this.shouldScrollOnNextShow = false;
      this.scrollToBottom();
      return;
    }

    if (!element) return;

    const distance =
      this.listTarget.getBoundingClientRect().bottom -
      element.getBoundingClientRect().bottom;
    if (Math.abs(distance) <= AUTOSCROLL_THRESHOLD_PX) {
      this.scrollToBottom();
    }
  }

  /** @this {TurboEventsControllerWithTargets} */
  isEventsTabActive() {
    const radio = /** @type {HTMLInputElement | null} */ (
      this.element.ownerDocument.getElementById(EVENTS_TAB_ID)
    );
    return Boolean(radio?.checked);
  }

  /** @this {TurboEventsControllerWithTargets} */
  scrollToBottom() {
    this.listTarget.scrollTop = this.listTarget.scrollHeight;
  }

  /**
   * @param {import("../../types.js").TurboEventPush} push
   * @returns {HTMLElement}
   * @this {TurboEventsControllerWithTargets}
   */
  createEventBox(push) {
    const doc = this.element.ownerDocument;
    const box = doc.createElement("div");
    box.className = "event-box";
    box.dataset.turboEventsTarget = "event";

    if (push.targetId) {
      box.appendChild(this.createRevealIcon(push.targetId));
    }

    const nameNode = doc.createElement("span");
    nameNode.className = "event-name";
    nameNode.textContent = push.name;
    box.appendChild(nameNode);

    const timeNode = doc.createElement("time");
    timeNode.className = "event-time";
    timeNode.dateTime = new Date(push.timestamp).toISOString();
    timeNode.textContent = formatEventTime(new Date(push.timestamp));
    box.appendChild(timeNode);

    if (push.details && Object.keys(push.details).length > 0) {
      box.appendChild(this.createDetailsSection(push.details));
    }

    return box;
  }

  /**
   * Renders the per-row `<details>` block: a click-to-expand summary plus
   * a two-column `<dl>` grid of label→value pairs. The cap-driven trim
   * removes entire rows in `eventTargetConnected`, so this DOM is built
   * once per event and discarded with the box.
   *
   * @param {Record<string, string>} details
   * @returns {HTMLElement}
   * @this {TurboEventsControllerWithTargets}
   */
  createDetailsSection(details) {
    const doc = this.element.ownerDocument;
    const section = doc.createElement("details");
    section.className = "event-box-details";

    const summary = doc.createElement("summary");
    summary.textContent = "Details";
    section.appendChild(summary);

    const grid = doc.createElement("dl");
    grid.className = "event-box-details-grid";
    for (const [key, value] of Object.entries(details)) {
      const term = doc.createElement("dt");
      term.className = "event-box-details-key";
      term.textContent = key;

      const definition = doc.createElement("dd");
      definition.className = "event-box-details-value";
      definition.textContent = value;

      grid.append(term, definition);
    }
    section.appendChild(grid);

    return section;
  }

  /**
   * Renders the per-row "reveal in Elements" icon. Each icon is its own
   * `data-controller="event-box"` instance so the per-row controller
   * (which reads the `targetId` Stimulus value) can look up the original
   * element when the user clicks.
   *
   * @param {string} targetId
   * @returns {HTMLElement}
   * @this {TurboEventsControllerWithTargets}
   */
  createRevealIcon(targetId) {
    const icon = this.element.ownerDocument.createElement("img");
    icon.src = "/icons/reveal-in-elements.svg";
    icon.className = "icon icon-btn event-reveal";
    icon.alt = "Reveal source element";
    icon.setAttribute("aria-label", "Reveal in Elements panel");
    icon.dataset.controller = "event-box";
    icon.dataset.eventBoxTargetIdValue = targetId;
    icon.dataset.action = "click->event-box#inspect";
    return icon;
  }
}
