import {
  ID_PREFIX,
  TREE_CHANGED_PUSH_TYPE,
  TURBO_EVENT_PUSH_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
} from "./constants.js";
import { resolveControllerValues } from "./controller-values.js";
import { MainWorldClient } from "./main-world-client.js";
import {
  validateValueDefinitions,
  validateOutletDefinitions,
} from "./main_world/controller-definitions.js";
import { validateStoredController } from "./main_world/controller-storage.js";
import { createReconnectingPort } from "./port-reconnect.js";
import { TreeWatcher } from "./tree-watcher.js";
import { TurboEventWatcher, TURBO_EVENT_NAMES } from "./turbo-event-watcher.js";
import { ValueWatcher } from "./value-watcher.js";

/**
 * @typedef {import("./types.js").ScanItem} ScanItem
 */

/**
 * @typedef {object} ContentInspectorOptions
 * @property {Document} [document]
 * @property {(value: string) => string} [cssEscape]
 * @property {number} [elementNodeType]
 * @property {(() => import("./types.js").PortLike) | null} [connectPort]
 * @property {typeof MutationObserver} [observerClass]
 * @property {typeof createReconnectingPort} [createReconnectingPort]
 */

export class ContentInspector {
  /**
   * @param {ContentInspectorOptions} [options]
   */
  constructor({
    document = globalThis.document,
    cssEscape = globalThis.CSS?.escape,
    elementNodeType = globalThis.Node?.ELEMENT_NODE ?? 1,
    connectPort = null,
    observerClass,
    createReconnectingPort: createReconnectingPortImpl = createReconnectingPort,
  } = {}) {
    this.document = document;
    this.cssEscape = cssEscape ?? ((/** @type {string} */ value) => value);
    this.elementNodeType = elementNodeType;
    /** @type {WeakMap<Element, string>} */
    this.elementKeys = new WeakMap();
    /** @type {Map<string, WeakRef<Element>>} */
    this.elementsByKey = new Map();
    /** @type {HTMLElement | null} */
    this.highlightOverlay = null;
    this.connectPort = connectPort;
    this.observerClass = observerClass;
    this.createReconnectingPort = createReconnectingPortImpl;
    /** @type {ValueWatcher | null} */
    this.activeWatcher = null;
    /** @type {{ id: string, identifier: string } | null} */
    this.activeWatchTarget = null;
    /** @type {import("./tree-watcher.js").TreeWatcher | null} */
    this.treeWatcher = null;
    /** @type {TurboEventWatcher | null} */
    this.turboEventWatcher = null;
    /** @type {{ port: import("./types.js").PortLike | null, reconnect: () => void, disconnect: () => void } | null} */
    this.reconnectingPort = null;
    /** @type {((event: PageTransitionEvent) => void) | null} */
    this.pageShowListener = null;
    /** @type {(() => void) | null} */
    this.treeReadyListener = null;
    this.mainWorldClient = new MainWorldClient(document, {
      storeController: validateStoredController,
      controllerValueDefinitions: validateValueDefinitions,
      controllerOutletDefinitions: validateOutletDefinitions,
    });

    this._initEventsPort();
  }

  /**
   * @returns {ScanItem[]}
   */
  scan() {
    const itemsByElement = /** @type {Map<Element, ScanItem>} */ (new Map());
    const elements = Array.from(
      this.document.querySelectorAll("turbo-frame, [data-controller]"),
    );

    this.elementsByKey.clear();

    for (const element of elements) {
      const item = this.getScanItem(element, itemsByElement);

      for (const controller of item.controllers) {
        for (const target of this.findControllerTargets(element, controller)) {
          const targetItem = this.getScanItem(target.element, itemsByElement);
          targetItem.targets ??= [];
          targetItem.targets.push({ controller, name: target.name });
        }
      }
    }

    return Array.from(itemsByElement.values());
  }

  /**
   * @param {string} id
   * @returns {import("./types.js").HighlightResponse}
   */
  highlight(id) {
    this.clearHighlight();

    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false };
    }

    const rect = element.getBoundingClientRect();
    const overlay = this.document.createElement("div");

    Object.assign(overlay.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxSizing: "border-box",
      outline: "3px dashed rgb(37, 99, 235)",
      background: "rgba(37, 99, 235, 0.12)",
      borderRadius: "2px",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    this.document.body.appendChild(overlay);
    this.highlightOverlay = overlay;

    return { success: true };
  }

  /**
   * @returns {import("./types.js").HighlightResponse}
   */
  clearHighlight() {
    if (!this.highlightOverlay) {
      return { success: true };
    }

    this.highlightOverlay.remove();
    this.highlightOverlay = null;

    return { success: true };
  }

  /**
   * @param {string} id
   * @returns {import("./types.js").InspectResponse}
   */
  inspect(id) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, selector: null };
    }

    return { success: true, selector: this.buildElementSelector(element) };
  }

  /**
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").StoreControllerResponse>}
   */
  async storeController(id, identifier) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: "Element not found" };
    }

    try {
      return await this.sendStoreControllerRequest({
        selector: this.buildElementSelector(element),
        identifier,
      });
    } catch (error) {
      return {
        success: false,
        // The MAIN client rejects transport failures with Errors.
        error:
          /** @type {Error} */ (error).message || "Controller storage failed",
      };
    }
  }

  /**
   * Reads the Stimulus values of a controller: the MAIN service
   * reports the declared value definitions, and the current values are
   * resolved from the element's attributes here in the content script.
   *
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").ControllerValuesResponse>}
   */
  async controllerValues(id, identifier) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: "Element not found" };
    }

    try {
      const response = await this.sendValueDefinitionsRequest({
        selector: this.buildElementSelector(element),
        identifier,
      });

      if (!response.success) {
        return response;
      }

      return {
        success: true,
        values: resolveControllerValues(response.definitions, element),
      };
    } catch (error) {
      return {
        success: false,
        // The MAIN client only rejects with Errors.
        error:
          /** @type {Error} */ (error).message || "Controller values failed",
      };
    }
  }

  /**
   * Reads the Stimulus targets of a controller by finding every element
   * matching `[data-{identifier}-target]` inside the host's subtree. Targets
   * are resolved from DOM attributes in the isolated script.
   *
   * @param {string} id
   * @param {string} identifier
   * @returns {import("./types.js").ControllerTargetsResponse}
   */
  controllerTargets(id, identifier) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: "Element not found" };
    }

    const targets = this.findControllerTargets(element, identifier).map(
      ({ element: targetElement, name }) => ({
        id: this.getElementKey(targetElement),
        tagName: targetElement.tagName.toLowerCase(),
        name,
      }),
    );

    return { success: true, targets };
  }

  /**
   * Reads the Stimulus outlets of a controller. Definitions come from the
   * MAIN service (the controller's `static outlets` array); the
   * matched element refs and tag info are resolved here in the content
   * script from the host's `data-{identifier}-{outlet}-outlet` attributes.
   *
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").ControllerOutletsResponse>}
   */
  async controllerOutlets(id, identifier) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: "Element not found" };
    }

    try {
      const response = await this.sendOutletDefinitionsRequest({
        selector: this.buildElementSelector(element),
        identifier,
      });

      if (!response.success) {
        return response;
      }

      const outlets = response.outlets.flatMap((name) =>
        this.findControllerOutlets(element, identifier, name),
      );

      return { success: true, outlets };
    } catch (error) {
      return {
        success: false,
        // The MAIN client only rejects with Errors.
        error:
          /** @type {Error} */ (error).message || "Controller outlets failed",
      };
    }
  }

  /**
   * Resolves all elements that an outlet declaration points at. The outlet
   * attribute (`data-{identifier}-{name}-outlet`) may carry an explicit CSS
   * selector; an absent or empty value falls back to Stimulus's default
   * `[data-controller~="{name}"]` selector.
   *
   * @param {Element} host - element hosting the controller
   * @param {string} identifier - controller identifier
   * @param {string} name - outlet name (also the target controller identifier)
   * @returns {import("./types.js").ControllerOutletEntry[]}
   */
  findControllerOutlets(host, identifier, name) {
    const attributeName = `data-${identifier}-${name}-outlet`;
    const attributeValue = host.getAttribute(attributeName);
    const selector =
      attributeValue && attributeValue.length > 0
        ? attributeValue
        : `[data-controller~="${this.cssEscape(name)}"]`;

    return Array.from(host.querySelectorAll(selector)).map((outletElement) => ({
      id: this.getElementKey(outletElement),
      tagName: outletElement.tagName.toLowerCase(),
      name,
    }));
  }

  /**
   * Starts watching a controller's value attributes for changes. A new
   * watch replaces any active watch. Pushes arrive over the events port.
   *
   * @param {string} id
   * @param {string} identifier
   * @returns {Promise<import("./types.js").WatchValuesResponse>}
   */
  async watchValues(id, identifier) {
    this.unwatchValues();

    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: "Element not found" };
    }

    let response;

    try {
      response = await this.sendValueDefinitionsRequest({
        selector: this.buildElementSelector(element),
        identifier,
      });
    } catch (error) {
      return {
        success: false,
        error:
          /** @type {Error} */ (error).message || "Controller values failed",
      };
    }

    if (!response.success) {
      return /** @type {import("./types.js").WatchValuesResponse} */ (response);
    }

    this.activeWatchTarget = { id, identifier };

    this.activeWatcher = new ValueWatcher({
      element,
      definitions: response.definitions,
      push: (values) => {
        this.reconnectingPort?.port?.postMessage({
          type: VALUES_CHANGED_PUSH_TYPE,
          id,
          identifier,
          values,
        });
      },
      observerClass: this.observerClass,
    });
    this.activeWatcher.start();

    return { success: true };
  }

  /**
   * Stops watching the current controller's values. The events port stays
   * connected for future use. Idempotent.
   *
   * @returns {import("./types.js").UnwatchValuesResponse}
   */
  unwatchValues() {
    if (this.activeWatcher) {
      this.activeWatcher.stop();
      this.activeWatcher = null;
    }

    this.activeWatchTarget = null;

    return { success: true };
  }

  postTreeChanged() {
    this.reconnectingPort?.port?.postMessage({
      type: TREE_CHANGED_PUSH_TYPE,
    });
  }

  startTreeWatcher() {
    this.treeWatcher = new TreeWatcher({
      scan: () => this.scan(),
      onChange: () => this.postTreeChanged(),
      document: this.document,
      observerClass: this.observerClass,
      debounceMs: 100,
    });
    this.treeWatcher.start();
  }

  startTreeWatcherWhenReady() {
    if (this.treeWatcher || this.treeReadyListener) return;
    if (this.document.readyState !== "loading") {
      this.startTreeWatcher();
      return;
    }
    this.treeReadyListener = () => {
      this.clearTreeReadyListener();
      this.startTreeWatcher();
    };
    this.document.addEventListener("DOMContentLoaded", this.treeReadyListener);
  }

  clearTreeReadyListener() {
    if (!this.treeReadyListener) return;
    this.document.removeEventListener(
      "DOMContentLoaded",
      this.treeReadyListener,
    );
    this.treeReadyListener = null;
  }

  startTurboEventWatcher() {
    this.turboEventWatcher = new TurboEventWatcher({
      document: this.document,
      eventNames: TURBO_EVENT_NAMES,
      onEvent: (payload, event) => {
        let targetId = null;
        const targetNode = event?.target;
        if (
          targetNode instanceof Node &&
          targetNode.nodeType === this.elementNodeType &&
          targetNode.ownerDocument === this.document
        ) {
          targetId = this.getElementKey(/** @type {Element} */ (targetNode));
        }
        this.reconnectingPort?.port?.postMessage({
          type: TURBO_EVENT_PUSH_TYPE,
          ...payload,
          targetId,
        });
      },
    });
    this.turboEventWatcher.start();
  }

  startPageLifecycleWatcher() {
    const window = this.document.defaultView;

    if (!window) {
      return;
    }

    this.pageShowListener = (/** @type {PageTransitionEvent} */ event) => {
      if (event.persisted) {
        this.reconnectingPort?.reconnect();
        this.postTreeChanged();
      }
    };
    window.addEventListener("pageshow", this.pageShowListener);
  }

  /**
   * Tears down the events port, tree watcher, turbo event watcher, and
   * page lifecycle listener. Call when the content script is done.
   */
  disconnect() {
    this.clearTreeReadyListener();
    this.mainWorldClient.disconnect();
    this.treeWatcher?.stop();
    this.treeWatcher = null;

    this.turboEventWatcher?.stop();
    this.turboEventWatcher = null;

    if (this.pageShowListener) {
      this.document.defaultView?.removeEventListener(
        "pageshow",
        this.pageShowListener,
      );
      this.pageShowListener = null;
    }

    this.reconnectingPort?.disconnect();
    this.reconnectingPort = null;
  }

  /**
   * Opens the events port eagerly and sets up automatic reconnection with
   * backoff. Called once from the constructor.
   */
  _initEventsPort() {
    if (!this.connectPort) {
      return;
    }

    this.reconnectingPort = this.createReconnectingPort({
      connectPort: this.connectPort,
      onReconnect: (port) => {
        if (this.activeWatchTarget && this.activeWatcher) {
          const { id, identifier } = this.activeWatchTarget;
          const values = resolveControllerValues(
            this.activeWatcher.definitions,
            this.activeWatcher.element,
          );
          port.postMessage({
            type: VALUES_CHANGED_PUSH_TYPE,
            id,
            identifier,
            values,
          });
        }
      },
    });
  }

  /**
   * @param {Element} element
   * @returns {string}
   */
  getElementKey(element) {
    if (element.id) {
      this.elementsByKey.set(element.id, new WeakRef(element));
      return element.id;
    }

    const existingKey = this.elementKeys.get(element);

    if (existingKey) {
      this.elementsByKey.set(existingKey, new WeakRef(element));
      return existingKey;
    }

    const generatedKey = this.generateId();
    this.elementKeys.set(element, generatedKey);
    this.elementsByKey.set(generatedKey, new WeakRef(element));
    return generatedKey;
  }

  /**
   * @param {Element} element
   * @param {Map<Element, ScanItem>} [itemsByElement]
   * @returns {string | null}
   */
  getParentInspectableId(element, itemsByElement = new Map()) {
    let parent = element.parentElement;

    while (parent) {
      if (
        itemsByElement.has(parent) ||
        parent.tagName.toLowerCase() === "turbo-frame" ||
        parent.getAttribute("data-controller")
      ) {
        return this.getElementKey(parent);
      }

      parent = parent.parentElement;
    }

    return null;
  }

  /**
   * @param {Element} element
   * @returns {string[]}
   */
  parseControllers(element) {
    const value = element.getAttribute("data-controller");

    if (!value) {
      return [];
    }

    return value
      .split(/\s+/)
      .map((controller) => controller.trim())
      .filter(Boolean);
  }

  /**
   * @param {Element} element
   * @param {Map<Element, ScanItem>} itemsByElement
   * @returns {ScanItem}
   */
  getScanItem(element, itemsByElement) {
    const existingItem = itemsByElement.get(element);

    if (existingItem) {
      return existingItem;
    }

    const parentId = this.getParentInspectableId(element, itemsByElement);
    const controllers = this.parseControllers(element);
    const key = this.getElementKey(element);
    const tagName = element.tagName.toLowerCase();
    const item = /** @type {ScanItem} */ ({
      id: key,
      parentId,
      tagName,
      controllers,
    });

    if (tagName === "turbo-frame") {
      item.src = element.getAttribute("src");
    }

    itemsByElement.set(element, item);
    return item;
  }

  /**
   * @param {Element} element
   * @param {string} controller
   * @returns {{ element: Element, name: string }[]}
   */
  findControllerTargets(element, controller) {
    const attributeName = `data-${controller}-target`;
    const selector = `[${this.cssEscape(attributeName)}]`;
    const targets = [];

    for (const targetElement of element.querySelectorAll(selector)) {
      const value = targetElement.getAttribute(attributeName);

      if (!value) {
        continue;
      }

      for (const name of value
        .split(/\s+/)
        .map((target) => target.trim())
        .filter(Boolean)) {
        targets.push({ element: targetElement, name });
      }
    }

    return targets;
  }

  /**
   * @returns {string}
   */
  generateId() {
    let key;

    do {
      key = `${ID_PREFIX}-${Math.random().toString(36).slice(2)}`;
    } while (this.elementsByKey.has(key) || this.document.getElementById(key));

    return key;
  }

  /**
   * @param {string} key
   * @returns {Element | null}
   */
  findElementByKey(key) {
    const element = this.elementsByKey.get(key)?.deref();
    if (element && element.isConnected === true) {
      return element;
    }

    const domElement = this.document.getElementById(key);
    if (domElement && domElement.isConnected === true) {
      return domElement;
    }

    return null;
  }

  /**
   * @param {Element} element
   * @returns {string}
   */
  buildElementSelector(element) {
    if (element.id) {
      return `#${this.cssEscape(element.id)}`;
    }

    const segments = [];
    let current = /** @type {Element | null} */ (element);

    while (current && current.nodeType === this.elementNodeType) {
      const tagName = current.tagName.toLowerCase();
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index += 1;
        }

        sibling = sibling.previousElementSibling;
      }

      segments.unshift(`${tagName}:nth-of-type(${index})`);
      current = current.parentElement;
    }

    return segments.join(" > ");
  }

  /**
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").StoreControllerResponse>}
   */
  sendStoreControllerRequest(detail) {
    return /** @type {Promise<import("./types.js").StoreControllerResponse>} */ (
      this.mainWorldClient.request("storeController", detail)
    );
  }

  /**
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").ControllerValueDefinitionsResponse>}
   */
  sendValueDefinitionsRequest(detail) {
    return /** @type {Promise<import("./types.js").ControllerValueDefinitionsResponse>} */ (
      this.mainWorldClient.request("controllerValueDefinitions", detail)
    );
  }

  /**
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").ControllerOutletDefinitionsResponse>}
   */
  sendOutletDefinitionsRequest(detail) {
    return /** @type {Promise<import("./types.js").ControllerOutletDefinitionsResponse>} */ (
      this.mainWorldClient.request("controllerOutletDefinitions", detail)
    );
  }
}
