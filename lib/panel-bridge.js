import { browser as defaultBrowser } from "wxt/browser";
import {
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from "./constants.js";

/**
 * @typedef {object} PanelBridgeOptions
 * @property {import("wxt/browser").WxtBrowser} [browserApi]
 */

// Implements communication with the content script, acting as a bridge between
// Panel UI and content.
export class PanelBridge {
  /**
   * @param {PanelBridgeOptions} [options]
   */
  constructor({ browserApi = defaultBrowser } = {}) {
    this.browser = browserApi;
    this.tabId = this.browser.devtools.inspectedWindow.tabId;
  }

  /**
   * Relays a message to the content script of the inspected tab via the
   * background script.
   *
   * @param {import("./types.js").ContentRequest} message
   * @returns {Promise<any>} the content script's response (shape depends on the message type)
   */
  async sendToInspectedTab(message) {
    const response = await this.browser.runtime.sendMessage(
      /** @type {import("./types.js").RelayMessage} */ ({
        type: RELAY_MESSAGE_TYPE,
        tabId: this.tabId,
        message,
      }),
    );

    if (response?.type === RELAY_ERROR_TYPE) {
      throw new Error(response.message);
    }

    return response;
  }

  /**
   * @param {string} selector
   */
  inspectElementBySelector(selector) {
    const escapedSelector = selector
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
    const code = `inspect(document.querySelector("${escapedSelector}"))`;
    this.browser.devtools.inspectedWindow.eval(code);
  }

  /**
   * @param {string} id
   */
  async inspectNode(id) {
    const response =
      /** @type {import("./types.js").InspectResponse | undefined} */ (
        await this.sendToInspectedTab({
          type: CONTENT_INSPECT_MESSAGE_TYPE,
          id,
        })
      );

    if (response?.success && response.selector) {
      this.inspectElementBySelector(response.selector);
    }
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").StoreControllerResponse>}
   */
  async storeControllerNode(id, identifier) {
    return this.sendToInspectedTab({
      type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
      id,
      identifier,
    });
  }
}
