/**
 * Watches the inspected DOM for changes that could affect the inspector tree
 * (turbo-frames, controller hosts, and target attributes) and notifies the
 * panel when the scanned tree has changed.
 */
export class TreeWatcher {
  /**
   * @param {object} options
   * @param {() => import("./types.js").ScanItem[]} options.scan
   * @param {() => void} options.onChange
   * @param {Document} options.document
   * @param {typeof MutationObserver} [options.observerClass]
   * @param {number} options.debounceMs
   */
  constructor({
    scan,
    onChange,
    document,
    observerClass = globalThis.MutationObserver,
    debounceMs,
  }) {
    this.scan = scan;
    this.onChange = onChange;
    this.document = document;
    this.observerClass = observerClass;
    this.debounceMs = debounceMs;
    /** @type {MutationObserver | null} */
    this.observer = null;
    /** @type {string | null} */
    this.snapshot = null;
    /** @type {Set<string>} */
    this.targetAttributeNames = new Set();
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.timer = null;
  }

  start() {
    const items = this.scan();
    this.snapshot = JSON.stringify(items);
    this.updateTargetAttributes(items);
    this.observer = new this.observerClass((records) =>
      this.handleRecords(records),
    );
    this.reconnectObserver();
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * @param {MutationRecord[]} records
   */
  handleRecords(records) {
    if (!this.isRelevant(records)) {
      return;
    }

    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => this.onTimeout(), this.debounceMs);
  }

  /**
   * @param {MutationRecord[]} records
   * @returns {boolean}
   */
  isRelevant(records) {
    for (const record of records) {
      if (record.type === "childList") {
        return true;
      }

      if (record.type === "attributes") {
        const attributeName = record.attributeName;

        if (!attributeName) {
          continue;
        }

        if (attributeName === "data-controller") {
          return true;
        }

        if (
          attributeName === "src" &&
          /** @type {Element} */ (record.target).tagName?.toLowerCase() ===
            "turbo-frame"
        ) {
          return true;
        }

        if (this.targetAttributeNames.has(attributeName)) {
          return true;
        }
      }
    }

    return false;
  }

  onTimeout() {
    this.timer = null;
    const items = this.scan();
    const snapshot = JSON.stringify(items);

    if (snapshot === this.snapshot) {
      return;
    }

    this.snapshot = snapshot;
    this.updateTargetAttributes(items);
    this.reconnectObserver();
    this.onChange();
  }

  /**
   * @param {import("./types.js").ScanItem[]} items
   */
  updateTargetAttributes(items) {
    this.targetAttributeNames = new Set();

    for (const item of items) {
      for (const controller of item.controllers) {
        this.targetAttributeNames.add(`data-${controller}-target`);
      }
    }
  }

  reconnectObserver() {
    if (!this.observer) {
      return;
    }

    this.observer.disconnect();
    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-controller", "src", ...this.targetAttributeNames],
    });
  }
}
