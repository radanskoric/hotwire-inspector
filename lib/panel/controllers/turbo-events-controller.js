import { storage } from "wxt/utils/storage";
import { SHOW_EVENT_ATTRIBUTE_EVENT } from "../../constants.js";
import { TURBO_EVENT_NAMES } from "../../turbo-event-watcher.js";
import { Filter } from "../filter.js";
import { PanelController } from "./panel-controller.js";

const FILTER_STORAGE_KEY = "local:excludedTurboEvents";

const AUTOSCROLL_THRESHOLD_PX = 4;
const ATTRIBUTE_PREVIEW_LIMIT = 140;
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
 *   filterTarget: HTMLSelectElement,
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
 * Empty and no-match placeholders are purely CSS-driven.
 */
export class TurboEventsController extends PanelController {
  /** @override */
  static targets = ["filter", "list", "clear", "droppedNotice", "event"];

  /** @override */
  static values = {
    maxEvents: { type: Number, default: 500 },
    droppedCount: { type: Number, default: 0 },
  };

  /** @type {Set<string>} */
  excludedNames = new Set();
  /** @type {Filter | null} */
  filter = null;
  /** @type {(() => void) | null} */
  unwatchFilter = null;

  /** @override @this {TurboEventsControllerWithTargets} */
  connect() {
    this.shouldScrollOnNextShow = false;
    this.abortController = new AbortController();
    this.filter = new Filter(
      this.filterTarget,
      (selected) => {
        const excluded = TURBO_EVENT_NAMES.filter(
          (name) => !selected.includes(name),
        );
        this.applyFilter(excluded);
        void storage.setItem(FILTER_STORAGE_KEY, excluded).catch((error) => {
          console.warn("Could not save Turbo event filter", error);
        });
      },
      "events",
    );
    this.filter.select.disable();
    void this.restoreFilter(this.abortController.signal);
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

  /** @override @this {TurboEventsControllerWithTargets} */
  disconnect() {
    this.abortController?.abort();
    this.abortController = null;
    this.unwatchFilter?.();
    this.unwatchFilter = null;
    this.filter?.destroy();
    this.filter = null;
    this.bridge.offTurboEvent();
  }

  /**
   * @param {AbortSignal} signal
   * @this {TurboEventsControllerWithTargets}
   */
  async restoreFilter(signal) {
    let changed = false;
    /** @type {unknown} */
    let value = [];
    try {
      this.unwatchFilter = storage.watch(FILTER_STORAGE_KEY, (value) => {
        changed = true;
        this.applyFilter(value);
      });
      value = await storage.getItem(FILTER_STORAGE_KEY);
    } catch (error) {
      if (!signal.aborted) {
        console.warn("Could not load Turbo event filter", error);
      }
    }
    if (!signal.aborted && !changed) this.applyFilter(value);
  }

  /**
   * @param {unknown} value
   * @this {TurboEventsControllerWithTargets}
   */
  applyFilter(value) {
    this.excludedNames = new Set(
      Array.isArray(value)
        ? value.filter((name) => typeof name === "string")
        : [],
    );
    this.filter?.update(
      TURBO_EVENT_NAMES,
      TURBO_EVENT_NAMES.filter((name) => !this.excludedNames.has(name)),
    );
    for (const row of this.eventTargets) {
      row.hidden = this.excludedNames.has(
        /** @type {string} */ (row.dataset.eventName),
      );
    }
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
    if (!element.hidden) this.maybeAutoscroll(element);
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
    box.dataset.eventName = push.name;
    box.hidden = this.excludedNames.has(push.name);
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
      box.appendChild(this.createDetailsSection(push.details, push.name));
    }

    return box;
  }

  /**
   * Renders the always-visible attributes with previews for long values.
   * Full values live on their row's buttons and are discarded with the row.
   *
   * @param {Record<string, string>} details
   * @param {string} name
   * @returns {HTMLElement}
   * @this {TurboEventsControllerWithTargets}
   */
  createDetailsSection(details, name) {
    const { htmlOriginalLength, ...attributes } = details;
    const doc = this.element.ownerDocument;
    const section = doc.createElement("div");
    section.className = "event-box-details";

    const grid = doc.createElement("dl");
    grid.className = "event-box-details-grid";
    for (const [key, value] of Object.entries(attributes)) {
      const term = doc.createElement("dt");
      term.className = "event-box-details-key";
      term.textContent = key;

      const definition = doc.createElement("dd");
      definition.className = "event-box-details-value";
      definition.textContent = value;
      if (value.length > ATTRIBUTE_PREVIEW_LIMIT) {
        definition.textContent = `${value.slice(0, ATTRIBUTE_PREVIEW_LIMIT)}... `;
        const more = doc.createElement("button");
        more.type = "button";
        more.className = "btn btn-small event-more";
        more.textContent = "more";
        more.setAttribute("aria-label", `Show captured ${key} for ${name}`);
        more.dataset.action = "click->turbo-events#showAttribute";
        more.dataset.name = name;
        more.dataset.attribute = key;
        more.dataset.value = value;
        if (key === "html" && htmlOriginalLength) {
          more.dataset.originalLength = htmlOriginalLength;
        }
        definition.appendChild(more);
      }

      grid.append(term, definition);
    }
    section.appendChild(grid);

    return section;
  }

  /** @param {MouseEvent} event */
  showAttribute(event) {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const { name, attribute, value } = button.dataset;
    const detail =
      /** @type {import("../../types.js").ShowEventAttributeDetail} */ ({
        source: button.closest(".event-box"),
        name,
        attribute,
        value,
        ...(button.dataset.originalLength
          ? { originalLength: Number(button.dataset.originalLength) }
          : {}),
      });
    this.element.ownerDocument.dispatchEvent(
      new CustomEvent(SHOW_EVENT_ATTRIBUTE_EVENT, { detail }),
    );
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
