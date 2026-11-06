import { Controller } from "@hotwired/stimulus";

/**
 * @typedef {LargePayloadDetailsController & {
 *   contentTarget: HTMLElement,
 *   noticeTarget: HTMLElement,
 * }} LargePayloadDetailsControllerWithTargets
 */

/** Displays captured text while its source row remains in the panel. */
export class LargePayloadDetailsController extends Controller {
  /** @override */
  static targets = ["content", "notice"];

  /** @type {HTMLElement | null} */
  source = null;

  /** @type {MutationObserver | null} */
  observer = null;

  /**
   * @param {import("../../types.js").ShowEventAttributeDetail} detail
   * @returns {string}
   * @this {LargePayloadDetailsControllerWithTargets}
   */
  activate({ source, name, attribute, value, originalLength }) {
    this.contentTarget.textContent = value;
    this.noticeTarget.textContent =
      originalLength === undefined
        ? ""
        : `Showing ${value.length.toLocaleString("en-US")} of ${originalLength.toLocaleString("en-US")} UTF-16 code units. The remaining HTML was omitted for performance.`;
    this.noticeTarget.hidden = !this.noticeTarget.textContent;
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
    this.noticeTarget.textContent = "";
    this.noticeTarget.hidden = true;
  }

  /** @override @this {LargePayloadDetailsControllerWithTargets} */
  disconnect() {
    this.deactivate();
  }
}
