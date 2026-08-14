import { PanelController } from "./panel-controller.js";
import {
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
} from "../../constants.js";

export class PanelNodeController extends PanelController {
  static values = {
    id: String,
  };

  /**
   * @this {PanelNodeController & { idValue: string }}
   */
  highlight() {
    return this.sendToInspectedTab({
      type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
      id: this.idValue,
    });
  }

  clearHighlight() {
    return this.sendToInspectedTab({
      type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
    });
  }

  /**
   * @this {PanelNodeController & { idValue: string }}
   */
  inspect() {
    return this.inspectNode(this.idValue);
  }

  /**
   * @param {Event} event
   * @this {PanelNodeController & { idValue: string }}
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   */
  async storeController(event) {
    event.stopPropagation();

    const badge = /** @type {HTMLElement} */ (event.currentTarget);
    const result = await this.storeControllerNode(
      this.idValue,
      /** @type {string} */ (badge.dataset.controllerIdentifier),
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
