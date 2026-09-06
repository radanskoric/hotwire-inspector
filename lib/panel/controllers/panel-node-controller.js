import { PanelController } from "./panel-controller.js";
import {
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  SHOW_CONTROLLER_DETAILS_EVENT,
} from "../../constants.js";

export class PanelNodeController extends PanelController {
  /** @override */
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
   * Opens the details panel for the clicked controller badge by dispatching
   * a panel-internal custom event (handled by `DetailsPanelController`).
   *
   * @param {Event} event
   * @this {PanelNodeController & { idValue: string }}
   */
  showDetails(event) {
    event.stopPropagation();

    const badge = /** @type {HTMLElement} */ (event.currentTarget);
    /** @type {import("../../types.js").ShowControllerDetailsDetail} */
    const detail = {
      nodeId: this.idValue,
      identifier: /** @type {string} */ (badge.dataset.controllerIdentifier),
    };

    this.element.ownerDocument.dispatchEvent(
      new CustomEvent(SHOW_CONTROLLER_DETAILS_EVENT, { detail }),
    );
  }
}
