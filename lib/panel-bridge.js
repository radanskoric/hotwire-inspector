import { browser as defaultBrowser } from "wxt/browser";
import {
  CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
  PANEL_EVENTS_PORT_NAME_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
  TREE_CHANGED_PUSH_TYPE,
  TURBO_EVENT_PUSH_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
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
    /** @type {ReturnType<typeof this.browser.runtime.connect> | null} */
    this.eventsPort = null;
    /** @type {((message: any) => void) | null} */
    this.valuesChangedCallback = null;
    /** @type {((message: import("./types.js").TreeChangedPush) => void) | null} */
    this.treeChangedCallback = null;
    /** @type {((message: import("./types.js").TurboEventPush) => void) | null} */
    this.turboEventCallback = null;
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
   * @returns {Promise<import("./types.js").InspectResponse | undefined>}
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

    return response;
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

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").ControllerValuesResponse>}
   */
  async controllerValues(id, identifier) {
    return this.sendToInspectedTab({
      type: CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
      id,
      identifier,
    });
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").ControllerTargetsResponse>}
   */
  async controllerTargets(id, identifier) {
    return this.sendToInspectedTab({
      type: CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
      id,
      identifier,
    });
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").ControllerOutletsResponse>}
   */
  async controllerOutlets(id, identifier) {
    return this.sendToInspectedTab({
      type: CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
      id,
      identifier,
    });
  }

  /**
   * Lazily opens the events port for receiving value-changed pushes.
   *
   * @returns {ReturnType<typeof this.browser.runtime.connect>}
   */
  connectEventsPort() {
    if (this.eventsPort) {
      return this.eventsPort;
    }

    const port = this.browser.runtime.connect({
      name: PANEL_EVENTS_PORT_NAME_PREFIX + this.tabId,
    });

    this.eventsPort = port;

    port.onMessage.addListener((message) => {
      if (message?.type === VALUES_CHANGED_PUSH_TYPE) {
        this.valuesChangedCallback?.(message);
      }

      if (message?.type === TREE_CHANGED_PUSH_TYPE) {
        this.treeChangedCallback?.(message);
      }

      if (message?.type === TURBO_EVENT_PUSH_TYPE) {
        this.turboEventCallback?.(message);
      }
    });

    port.onDisconnect.addListener(() => {
      this.eventsPort = null;
    });

    return port;
  }

  /** Clears the live-values subscription when its controller disconnects. */
  offValuesChanged() {
    this.valuesChangedCallback = null;
  }

  /**
   * Registers a callback for values-changed push messages.
   * @param {(message: import("./types.js").ValuesChangedPush) => void} callback
   */
  onValuesChanged(callback) {
    this.valuesChangedCallback = callback;
  }

  /**
   * Registers a callback for tree-changed push messages and ensures the
   * events port is connected so pushes can arrive.
   *
   * @param {(message: import("./types.js").TreeChangedPush) => void} callback
   */
  onTreeChanged(callback) {
    this.treeChangedCallback = callback;
    this.connectEventsPort();
  }

  /**
   * Registers a callback for turbo-event push messages and ensures the
   * events port is connected so pushes can arrive.
   *
   * @param {(message: import("./types.js").TurboEventPush) => void} callback
   */
  onTurboEvent(callback) {
    this.turboEventCallback = callback;
    this.connectEventsPort();
  }

  /**
   * Clears the turbo-event push callback so pushes are dropped on the
   * floor. Call from a controller's `disconnect()` to avoid rendering
   * into a torn-down subtree after Stimulus has discarded the controller.
   */
  offTurboEvent() {
    this.turboEventCallback = null;
  }

  /**
   * Starts watching a controller's values for live updates.
   *
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").WatchValuesResponse>}
   */
  async watchControllerValues(id, identifier) {
    this.connectEventsPort();
    return this.sendToInspectedTab({
      type: CONTENT_WATCH_VALUES_MESSAGE_TYPE,
      id,
      identifier,
    });
  }

  /**
   * Stops watching the current controller's values.
   *
   * @returns {Promise<import("./types.js").UnwatchValuesResponse>}
   */
  async unwatchControllerValues() {
    return this.sendToInspectedTab({
      type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
    });
  }
}
