import {
  CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
  ID_PREFIX,
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
  VALUES_CHANGED_PUSH_TYPE,
} from "./constants.js";
import { resolveControllerValues } from "./controller-values.js";
import { ValueWatcher } from "./value-watcher.js";

/**
 * @typedef {import("./types.js").ScanItem} ScanItem
 */

/**
 * @typedef {object} ContentInspectorOptions
 * @property {Document} [document]
 * @property {(value: string) => string} [cssEscape]
 * @property {number} [elementNodeType]
 * @property {typeof import("wxt/utils/inject-script").injectScript | null} [injectScript]
 * @property {(() => import("./types.js").PortLike) | null} [connectPort]
 * @property {typeof MutationObserver} [observerClass]
 */

export class ContentInspector {
  /**
   * @param {ContentInspectorOptions} [options]
   */
  constructor({
    document = globalThis.document,
    cssEscape = globalThis.CSS?.escape,
    elementNodeType = globalThis.Node?.ELEMENT_NODE ?? 1,
    injectScript = null,
    connectPort = null,
    observerClass,
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
    this.injectScript = injectScript;
    /** @type {Promise<import("wxt/utils/inject-script").InjectScriptResult> | null} */
    this.injectedScriptPromise = null;
    this.connectPort = connectPort;
    this.observerClass = observerClass;
    /** @type {import("./types.js").PortLike | null} */
    this.eventsPort = null;
    /** @type {ValueWatcher | null} */
    this.activeWatcher = null;
    /** @type {{ id: string, identifier: string } | null} */
    this.activeWatchTarget = null;
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
        // The injected script loader only rejects with Errors.
        error:
          /** @type {Error} */ (error).message || "Controller storage failed",
      };
    }
  }

  /**
   * Reads the Stimulus values of a controller: the injected page script
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
        // The injected script loader only rejects with Errors.
        error:
          /** @type {Error} */ (error).message || "Controller values failed",
      };
    }
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
    this.ensureEventsPort();

    const { eventsPort } = this;

    this.activeWatcher = new ValueWatcher({
      element,
      definitions: response.definitions,
      push: (values) => {
        eventsPort?.postMessage({
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
   * Stops watching the current controller's values and disconnects the
   * events port. Idempotent.
   *
   * @returns {import("./types.js").UnwatchValuesResponse}
   */
  unwatchValues() {
    if (this.activeWatcher) {
      this.activeWatcher.stop();
      this.activeWatcher = null;
    }

    this.activeWatchTarget = null;

    if (this.eventsPort) {
      this.eventsPort.disconnect();
      this.eventsPort = null;
    }

    return { success: true };
  }

  /**
   * Lazily opens the events port if one is not already connected.
   */
  ensureEventsPort() {
    if (this.eventsPort || !this.connectPort) {
      return;
    }

    const port = this.connectPort();

    this.eventsPort = port;

    port.onDisconnect.addListener(() => {
      this.eventsPort = null;

      if (this.activeWatchTarget) {
        this.ensureEventsPort();

        const currentPort = /** @type {import("./types.js").PortLike} */ (
          /** @type {unknown} */ (this.eventsPort)
        );

        if (currentPort && this.activeWatcher) {
          const { id, identifier } = this.activeWatchTarget;
          const values = resolveControllerValues(
            this.activeWatcher.definitions,
            this.activeWatcher.element,
          );
          currentPort.postMessage({
            type: VALUES_CHANGED_PUSH_TYPE,
            id,
            identifier,
            values,
          });
        }
      }
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

    return element || this.document.getElementById(key);
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
   * @returns {Promise<import("wxt/utils/inject-script").InjectScriptResult>}
   */
  loadInjectedScript() {
    if (!this.injectScript) {
      return Promise.reject(
        new Error("Injected page script loader unavailable"),
      );
    }

    this.injectedScriptPromise ??= this.injectScript(
      "/inspected-page-inject.js",
      { keepInDom: true },
    );
    return this.injectedScriptPromise;
  }

  /**
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").StoreControllerResponse>}
   */
  sendStoreControllerRequest(detail) {
    return /** @type {Promise<import("./types.js").StoreControllerResponseDetail>} */ (
      this.sendInjectedScriptRequest(
        {
          requestEvent: STORE_CONTROLLER_REQUEST_EVENT,
          responseEvent: STORE_CONTROLLER_RESPONSE_EVENT,
        },
        detail,
      )
    );
  }

  /**
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").ControllerValueDefinitionsResponse>}
   */
  sendValueDefinitionsRequest(detail) {
    return /** @type {Promise<import("./types.js").ControllerValueDefinitionsResponseDetail>} */ (
      this.sendInjectedScriptRequest(
        {
          requestEvent: CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
          responseEvent: CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
        },
        detail,
      )
    );
  }

  /**
   * Sends a request to the injected page script over a CustomEvent pair
   * dispatched on the script element, resolving with the response that
   * carries the matching requestId.
   *
   * @param {{ requestEvent: string, responseEvent: string }} events
   * @param {{ selector: string, identifier: string }} detail
   * @returns {Promise<import("./types.js").StoreControllerResponseDetail | import("./types.js").ControllerValueDefinitionsResponseDetail>}
   */
  async sendInjectedScriptRequest(events, detail) {
    const injectedScript = await this.loadInjectedScript();
    const script = injectedScript.script ?? injectedScript;
    const requestId = this.generateId();
    const CustomEventConstructor =
      this.document.defaultView?.CustomEvent ?? globalThis.CustomEvent;

    return new Promise((resolve) => {
      const handleResponse = (/** @type {Event} */ event) => {
        const responseDetail =
          /** @type {import("./types.js").StoreControllerResponseDetail | import("./types.js").ControllerValueDefinitionsResponseDetail} */ (
            JSON.parse(/** @type {CustomEvent} */ (event).detail)
          );

        if (responseDetail?.requestId !== requestId) {
          return;
        }

        script.removeEventListener(events.responseEvent, handleResponse);
        resolve(responseDetail);
      };

      script.addEventListener(events.responseEvent, handleResponse);
      script.dispatchEvent(
        new CustomEventConstructor(events.requestEvent, {
          detail: JSON.stringify({ ...detail, requestId }),
        }),
      );
    });
  }
}
