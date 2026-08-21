import { resolveControllerValues } from "./controller-values.js";

/**
 * Observes a single element's Stimulus value attributes via
 * MutationObserver and pushes resolved values on change. Uses a JSON
 * snapshot comparison to suppress no-op pushes.
 */
export class ValueWatcher {
  /**
   * @param {object} options
   * @param {Element} options.element
   * @param {import("./types.js").ControllerValueDefinition[]} options.definitions
   * @param {(values: import("./types.js").ControllerValue[]) => void} options.push
   * @param {typeof MutationObserver} [options.observerClass] - test seam
   */
  constructor({
    element,
    definitions,
    push,
    observerClass = globalThis.MutationObserver,
  }) {
    this.element = element;
    this.definitions = definitions;
    this.push = push;
    this.observerClass = observerClass;
    /** @type {MutationObserver | null} */
    this.observer = null;
    /** @type {string | null} */
    this.lastSnapshot = null;
  }

  start() {
    if (this.definitions.length === 0) {
      return;
    }

    const values = resolveControllerValues(this.definitions, this.element);
    this.lastSnapshot = JSON.stringify(values);
    this.push(values);

    this.observer = new this.observerClass(() => {
      const current = resolveControllerValues(this.definitions, this.element);
      const snapshot = JSON.stringify(current);

      if (snapshot === this.lastSnapshot) {
        return;
      }

      this.lastSnapshot = snapshot;
      this.push(current);
    });

    this.observer.observe(this.element, {
      attributes: true,
      attributeFilter: this.definitions.map((d) => d.attributeName),
    });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
