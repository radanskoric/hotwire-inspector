import { PanelController } from "./panel-controller.js";

const AUTOSCROLL_THRESHOLD_PX = 4;
const RADIO_NAME = "panel-tab";
const EVENTS_TAB_ID = "tab-events";

/**
 * @typedef {TurboEventsController & {
 *   listTarget: HTMLElement,
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
  static targets = ["list", "droppedNotice", "event"];

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
  }

  /** @this {TurboEventsControllerWithTargets} */
  disconnect() {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * The Stimulus `event` target lifecycle takes over from here —
   * trimming, dropped-count bookkeeping, and autoscroll all run from
   * `eventTargetConnected`.
   *
   * @param {string} name
   * @this {TurboEventsControllerWithTargets}
   */
  addEvent(name) {
    this.listTarget.appendChild(this.createEventBox(name));
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
   * @param {string} name
   * @returns {HTMLElement}
   * @this {TurboEventsControllerWithTargets}
   */
  createEventBox(name) {
    const box = this.element.ownerDocument.createElement("div");
    box.className = "event-box";
    box.dataset.turboEventsTarget = "event";
    box.textContent = name;
    return box;
  }
}
