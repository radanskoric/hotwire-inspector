/**
 * @typedef {object} TurboEventPayload
 * @property {string} name
 * @property {number} timestamp - absolute epoch ms captured on the inspected page.
 * @property {Record<string, string>} details - per-event details extracted at
 *   capture time by `turboEventDetailsFor`. Empty when the watcher has no
 *   rule for this event type (e.g. the detail payload is not available).
 */

/**
 * @typedef {object} TurboEventWatcherOptions
 * @property {Document} document
 * @property {readonly string[]} eventNames
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
  "turbo:reload",
  "turbo:before-fetch-request",
  "turbo:before-fetch-response",
  "turbo:fetch-request-error",
  "turbo:frame-click",
  "turbo:frame-missing",
  "turbo:before-frame-render",
  "turbo:frame-render",
  "turbo:frame-load",
  "turbo:before-stream-render",
  "turbo:before-morph-element",
  "turbo:morph-element",
  "turbo:before-morph-attribute",
  "turbo:morph",
  "turbo:submit-start",
  "turbo:submit-end",
  "turbo:before-prefetch",
];

export const FRAME_HTML_LIMIT = 65536;

export const MAIN_WORLD_TURBO_EVENT_NAMES = Object.freeze([
  "turbo:before-frame-render",
]);
export const ISOLATED_WORLD_TURBO_EVENT_NAMES = Object.freeze(
  TURBO_EVENT_NAMES.filter(
    (name) => !MAIN_WORLD_TURBO_EVENT_NAMES.includes(name),
  ),
);

/**
 * @param {unknown} value
 * @returns {string}
 */
function readString(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Read an attribute off an element when both the element and the attribute
 * value are present. Returns "" otherwise so the caller can drop the
 * resulting detail with `dropEmpty`.
 *
 * @param {unknown} element
 * @param {string} name
 * @returns {string}
 */
function readAttribute(element, name) {
  const elementLike =
    /** @type {{ getAttribute?: (name: string) => string | null } | null} */ (
      element
    );
  if (!elementLike || typeof elementLike.getAttribute !== "function") {
    return "";
  }
  return readString(elementLike.getAttribute(name));
}

/**
 * Reduce an Error-like value to a stringified message. Returns "" when the
 * value is null/undefined or has no useful surface so callers can drop
 * the entry via `dropEmpty`.
 *
 * @param {unknown} error
 * @returns {string}
 */
function readErrorMessage(error) {
  if (error === null || error === undefined) {
    return "";
  }
  const errorLike = /** @type {{ message?: unknown }} */ (error);
  if (typeof errorLike.message === "string") {
    return errorLike.message;
  }
  return String(error);
}

/**
 * Drop empty-string entries from a per-event details bag. Empty values
 * carry no diagnostic signal, so we filter them at the rule boundary
 * rather than letting them leak into the panel's `<dl>` renderer.
 *
 * @param {Record<string, string>} entries
 * @returns {Record<string, string>}
 */
function dropEmpty(entries) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Extracts per-event details from a captured Turbo event. Pure
 * switch-statement helper so the rule list stays obvious and unit-testable
 * in isolation. Returns an empty record when the event has no rule, when
 * the event reference is missing, or when every captured field is empty.
 *
 * The rule set is intentionally narrow: curated scalars and the incoming
 * frame's serialized markup. Reading outerHTML allocates the full string.
 * Function properties, live
 * `Element` / `Request` / `Response` / `FormSubmission` references, and
 * bodies are deliberately skipped — those surfaces are unsafe to
 * serialize across the message bus or too noisy for a one-line event
 * row. Add a new case here to thread a new detail through the push
 * pipeline.
 *
 * @param {string} name - `event.type` from the captured event.
 * @param {Event | null | undefined} event - the original captured event reference.
 * @returns {Record<string, string>}
 */
export function turboEventDetailsFor(name, event) {
  const detail = /** @type {Record<string, unknown>} */ (
    /** @type {{ detail?: Record<string, unknown> }} */ (event)?.detail ?? {}
  );

  switch (name) {
    case "turbo:click":
    case "turbo:before-visit":
    case "turbo:load": {
      const url = readString(detail.url);
      return url ? { url } : {};
    }
    case "turbo:visit": {
      return dropEmpty({
        url: readString(detail.url),
        action: readString(detail.action),
      });
    }
    case "turbo:before-render":
    case "turbo:render": {
      return dropEmpty({ renderMethod: readString(detail.renderMethod) });
    }
    case "turbo:reload": {
      // Turbo dispatches `dispatch("turbo:reload", { detail: reason })` —
      // event.detail is the reason string itself, not a wrapper object.
      const reason =
        typeof detail === "string" ? detail : readString(detail.reason);
      return dropEmpty({ reason });
    }
    case "turbo:before-morph-attribute": {
      return dropEmpty({
        attributeName: readString(detail.attributeName),
        mutationType: readString(detail.mutationType),
      });
    }
    case "turbo:submit-start": {
      const form = /** @type {{ formElement?: unknown } | undefined} */ (
        detail.formSubmission
      )?.formElement;
      return dropEmpty({
        formAction: readAttribute(form, "action"),
        formMethod: readAttribute(form, "method").toUpperCase(),
      });
    }
    case "turbo:submit-end": {
      return dropEmpty({
        success: detail.success === undefined ? "" : String(detail.success),
        error: readErrorMessage(detail.error),
      });
    }
    case "turbo:before-frame-render": {
      const frame =
        /** @type {Element & { id?: string } | null | undefined} */ (
          detail.newFrame
        );
      const details = dropEmpty({
        newFrameSrc: readAttribute(frame, "src"),
        newFrameId: readString(frame?.id),
      });
      const omitted = [];
      for (const [key, value] of Object.entries(details)) {
        if (value.length > 8192) {
          delete details[key];
          omitted.push(key);
        }
      }
      if (omitted.length) {
        details.detailsError = `Fields omitted: ${omitted.join(", ")} exceed 8192 code units`;
      }
      // Serialization allocates the complete string before its size can be checked.
      const html = readString(frame?.outerHTML);
      if (html.length > FRAME_HTML_LIMIT) {
        // Avoid splitting a UTF-16 surrogate pair at the retention boundary.
        const splitsPair = /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(
          html.slice(FRAME_HTML_LIMIT - 1, FRAME_HTML_LIMIT + 1),
        );
        details.html = html.slice(
          0,
          splitsPair ? FRAME_HTML_LIMIT - 1 : FRAME_HTML_LIMIT,
        );
        details.htmlOriginalLength = String(html.length);
      } else if (html) {
        details.html = html;
      }
      return details;
    }
    case "turbo:frame-render": {
      const succeeded = String(
        /** @type {{ succeeded?: unknown } | undefined} */ (
          detail.fetchResponse
        )?.succeeded ?? "",
      );
      return succeeded ? { succeeded } : {};
    }
    case "turbo:frame-missing": {
      const response =
        /** @type {{ url?: unknown, status?: unknown } | null | undefined} */ (
          detail.response
        );
      return dropEmpty({
        url: response ? readString(response.url) : "",
        status: response ? String(response.status ?? "") : "",
      });
    }
    case "turbo:before-stream-render": {
      const stream = /** @type {Record<string, unknown> | null | undefined} */ (
        detail.newStream
      );
      return dropEmpty({
        action: stream ? readString(stream.action) : "",
        target: stream ? readString(stream.target) : "",
        targets: stream ? readString(stream.targets) : "",
      });
    }
    case "turbo:before-fetch-request": {
      const urlString =
        detail.url === null || detail.url === undefined
          ? ""
          : String(detail.url);
      const method = /** @type {{ method?: unknown } | undefined} */ (
        detail.fetchOptions
      )?.method;
      const methodString =
        typeof method === "string" ? method.toUpperCase() : "";
      return dropEmpty({ url: urlString, method: methodString });
    }
    case "turbo:before-fetch-response": {
      const succeeded = String(
        /** @type {{ succeeded?: unknown } | undefined} */ (
          detail.fetchResponse
        )?.succeeded ?? "",
      );
      return succeeded ? { succeeded } : {};
    }
    case "turbo:before-prefetch": {
      const target =
        /** @type {{ getAttribute?: (name: string) => string | null } | null | undefined} */ (
          event?.target
        );
      if (!target || typeof target.getAttribute !== "function") {
        return {};
      }
      const href = readString(target.getAttribute("href"));
      return href ? { href } : {};
    }
    case "turbo:fetch-request-error": {
      return dropEmpty({ error: readErrorMessage(detail.error) });
    }
    default:
      return {};
  }
}

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
    let details;
    try {
      details = turboEventDetailsFor(event.type, event);
    } catch {
      // Page-owned getters must not disrupt the source event or later captures.
      return;
    }
    this.onEvent(
      {
        name: event.type,
        timestamp: Date.now(),
        details,
      },
      event,
    );
  }
}
