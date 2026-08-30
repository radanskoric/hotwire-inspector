/**
 * @typedef {object} TurboEventPayload
 * @property {string} name
 * @property {number} timestamp - absolute epoch ms captured on the inspected page.
 */

/**
 * @typedef {object} TurboEventWatcherOptions
 * @property {Document} document
 * @property {string[]} eventNames
 * @property {(payload: TurboEventPayload, event: Event) => void} onEvent
 */

/**
 * The curated set of Turbo 8.x DOM events the watcher listens for. All of
 * these bubble to `document`, so a single capture-phase listener on
 * `document` catches them regardless of where they originate.
 */
export const TURBO_EVENT_NAMES = [
  "turbo:click",
  "turbo:before-visit",
  "turbo:visit",
  "turbo:before-cache",
  "turbo:before-render",
  "turbo:render",
  "turbo:load",
  "turbo:before-fetch-request",
  "turbo:before-fetch-response",
  "turbo:fetch-request-error",
  "turbo:frame-click",
  "turbo:frame-missing",
  "turbo:before-frame-render",
  "turbo:frame-render",
  "turbo:frame-load",
  "turbo:before-stream-render",
  "turbo:stream-render",
  "turbo:before-morph-element",
  "turbo:morph-element",
  "turbo:before-morph-attribute",
  "turbo:morph",
  "turbo:submit-start",
  "turbo:submit-end",
  "turbo:before-prefetch",
];

/**
 * Registers capture-phase document listeners for a curated set of Turbo
 * DOM events and forwards each one to a single onEvent callback. Each
 * payload carries an absolute `Date.now()` timestamp captured on the inspected
 * page so the panel can format the time-of-day with `Intl.DateTimeFormat`.
 */
export class TurboEventWatcher {
  /**
   * @param {TurboEventWatcherOptions} options
   */
  constructor({ document, eventNames, onEvent }) {
    this.document = document;
    this.eventNames = eventNames;
    this.onEvent = onEvent;
    /** @type {boolean} */
    this.started = false;
    this.handleEvent = this.handleEvent.bind(this);
  }

  start() {
    if (this.started) {
      return;
    }

    if (!this.document) {
      return;
    }

    for (const name of this.eventNames) {
      this.document.addEventListener(name, this.handleEvent, true);
    }

    this.started = true;
  }

  stop() {
    if (!this.started) {
      return;
    }

    if (!this.document) {
      this.started = false;
      return;
    }

    for (const name of this.eventNames) {
      this.document.removeEventListener(name, this.handleEvent, true);
    }

    this.started = false;
  }

  /**
   * @param {Event} event
   */
  handleEvent(event) {
    this.onEvent(
      {
        name: event.type,
        timestamp: Date.now(),
      },
      event,
    );
  }
}
