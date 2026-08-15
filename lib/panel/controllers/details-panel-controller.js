import { PanelController } from "./panel-controller.js";

/**
 * Side panel showing the details of a single Stimulus controller instance.
 * Opened via a `SHOW_CONTROLLER_DETAILS_EVENT` custom event dispatched on
 * the panel window (see `PanelNodeController.showDetails`) and reconciled
 * against fresh scan data via `SCAN_REFRESHED_EVENT`.
 */
export class DetailsPanelController extends PanelController {
  static targets = ["identifier"];

  static values = {
    nodeId: String,
    identifier: String,
  };

  /**
   * @param {CustomEvent<import("../../types.js").ShowControllerDetailsDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement }}
   */
  show(event) {
    const { nodeId, identifier } = event.detail;
    this.nodeIdValue = nodeId;
    this.identifierValue = identifier;
    this.identifierTarget.textContent = identifier;
    this.element.classList.add("open");
  }

  close() {
    this.element.classList.remove("open");
  }

  /**
   * Keeps the panel in sync with fresh scan data: stays open (and re-renders)
   * while the element still exists and still has the controller, closes
   * otherwise.
   *
   * @param {CustomEvent<import("../../types.js").ScanRefreshedDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement }}
   */
  refresh(event) {
    if (!this.element.classList.contains("open")) {
      return;
    }

    const { items } = event.detail;
    const item = items.find((candidate) => candidate.id === this.nodeIdValue);

    if (item?.controllers?.includes(this.identifierValue)) {
      this.identifierTarget.textContent = this.identifierValue;
    } else {
      this.close();
    }
  }

  /**
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string }}
   */
  async storeInConsole() {
    const result = await this.storeControllerNode(
      this.nodeIdValue,
      this.identifierValue,
    );
    const template =
      this.element.ownerDocument.getElementById("notice-template");

    if (template) {
      // The notice template statically contains a root element with a
      // `[slot="text"]` child (see the panel HTML).
      const noticeElement = /** @type {Element} */ (
        /** @type {DocumentFragment} */ (
          /** @type {HTMLTemplateElement} */ (template).content.cloneNode(true)
        ).firstElementChild
      );
      const textTarget = /** @type {Element} */ (
        noticeElement.querySelector('[slot="text"]')
      );
      textTarget.textContent = result.success
        ? `${result.identifier} controller instance stored as ${result.name}`
        : result.error || "Controller storage failed";
      this.element.ownerDocument.body.appendChild(noticeElement);
    }

    return result;
  }
}
