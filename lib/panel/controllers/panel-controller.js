import { Controller } from "@hotwired/stimulus";
import { PANEL_BRIDGE_PROPERTY } from "../../constants.js";

export class PanelController extends Controller {
  /**
   * The shared panel bridge, stashed on the panel document by
   * `registerPanelControllers`.
   *
   * @returns {import("../../panel-bridge.js").PanelBridge}
   */
  get bridge() {
    return /** @type {Document & Record<typeof PANEL_BRIDGE_PROPERTY, import("../../panel-bridge.js").PanelBridge>} */ (
      this.element.ownerDocument
    )[PANEL_BRIDGE_PROPERTY];
  }

  /**
   * @param {import("../../types.js").ContentRequest} message
   * @returns {Promise<any>} the content script's response
   */
  sendToInspectedTab(message) {
    return this.bridge.sendToInspectedTab(message);
  }

  /**
   * @param {string} id
   * @returns {Promise<import("../../types.js").InspectResponse | undefined>}
   */
  inspectNode(id) {
    return this.bridge.inspectNode(id);
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   */
  storeControllerNode(id, identifier) {
    return this.bridge.storeControllerNode(id, identifier);
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("../../types.js").ControllerValuesResponse>}
   */
  controllerValues(id, identifier) {
    return this.bridge.controllerValues(id, identifier);
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("../../types.js").ControllerTargetsResponse>}
   */
  controllerTargets(id, identifier) {
    return this.bridge.controllerTargets(id, identifier);
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("../../types.js").ControllerOutletsResponse>}
   */
  controllerOutlets(id, identifier) {
    return this.bridge.controllerOutlets(id, identifier);
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("../../types.js").WatchValuesResponse>}
   */
  watchControllerValues(id, identifier) {
    return this.bridge.watchControllerValues(id, identifier);
  }

  /**
   * @returns {Promise<import("../../types.js").UnwatchValuesResponse>}
   */
  unwatchControllerValues() {
    return this.bridge.unwatchControllerValues();
  }
}
