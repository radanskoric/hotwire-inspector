import { Controller } from "@hotwired/stimulus";

/**
 * @typedef {LargePayloadDetailsController & {
 *   contentTarget: HTMLElement,
 * }} LargePayloadDetailsControllerWithTargets
 */

/** Displays captured text while its source row remains in the panel. */
export class LargePayloadDetailsController extends Controller {
  /** @override */
  static targets = ["content"];

  /** @type {HTMLElement | null} */
  source = null;

  /** @type {MutationObserver | null} */
  observer = null;

  /**
   * @param {import("../../types.js").ShowEventAttributeDetail} detail
   * @returns {string}
   * @this {LargePayloadDetailsControllerWithTargets}
   */
  activate({ source, name, attribute, value }) {
    this.contentTarget.textContent = value;
    this.source = source;
    source.classList.add("selected");
    this.observer = new MutationObserver(() => {
      if (!source.isConnected) {
        this.dispatch("close-request", { prefix: "details-panel" });
      }
    });
    this.observer.observe(this.element.ownerDocument.body, {
      childList: true,
      subtree: true,
    });
    return `${name} — ${attribute}`;
  }

  /** @this {LargePayloadDetailsControllerWithTargets} */
  deactivate() {
    this.observer?.disconnect();
    this.observer = null;
    this.source?.classList.remove("selected");
    this.source = null;
    this.contentTarget.textContent = "";
  }

  /** @override @this {LargePayloadDetailsControllerWithTargets} */
  disconnect() {
    this.deactivate();
  }
}
