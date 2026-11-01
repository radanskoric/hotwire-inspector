import { Controller } from "@hotwired/stimulus";

/**
 * @typedef {DetailsPanelController & {
 *   kindValue: string,
 *   titleTarget: HTMLElement,
 *   stimulusControllerDetailsOutlet: import("./stimulus-controller-details-controller.js").StimulusControllerDetailsControllerWithTargets,
 *   largePayloadDetailsOutlet: import("./large-payload-details-controller.js").LargePayloadDetailsControllerWithTargets,
 * }} DetailsPanelControllerWithTargets
 */

/** Shared slide-over shell. Content controllers own their resources and UI. */
export class DetailsPanelController extends Controller {
  /** @override */
  static targets = ["title"];
  /** @override */
  static values = { kind: { type: String, default: "controller" } };
  /** @override */
  static outlets = ["stimulus-controller-details", "large-payload-details"];

  /** @type {{ deactivate(): void } | null} */
  activeContent = null;

  /**
   * @param {CustomEvent<import("../../types.js").ShowControllerDetailsDetail>} event
   * @this {DetailsPanelControllerWithTargets}
   */
  showControllerDetails(event) {
    this.activeContent?.deactivate();
    const content = this.stimulusControllerDetailsOutlet;
    this.activeContent = content;
    this.open(content.activate(event.detail), "controller");
  }

  /**
   * @param {CustomEvent<import("../../types.js").ShowEventAttributeDetail>} event
   * @this {DetailsPanelControllerWithTargets}
   */
  showEventAttribute(event) {
    this.activeContent?.deactivate();
    const content = this.largePayloadDetailsOutlet;
    this.activeContent = content;
    this.open(content.activate(event.detail), "event");
  }

  /**
   * @param {string} title
   * @param {string} kind
   * @this {DetailsPanelControllerWithTargets}
   */
  open(title, kind) {
    this.titleTarget.textContent = title;
    this.kindValue = kind;
    this.element.classList.add("open");
  }

  close() {
    this.activeContent?.deactivate();
    this.activeContent = null;
    this.element.classList.remove("open");
  }

  /** @override */
  disconnect() {
    this.close();
  }
}
