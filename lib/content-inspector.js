import {
  ID_PREFIX,
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
} from "./constants.js";

/**
 * @typedef {import("./types.js").ScanItem} ScanItem
 */

/**
 * @typedef {object} ContentInspectorOptions
 * @property {Document} [document]
 * @property {(value: string) => string} [cssEscape]
 * @property {number} [elementNodeType]
 * @property {typeof import("wxt/utils/inject-script").injectScript | null} [injectScript]
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
  async sendStoreControllerRequest(detail) {
    const injectedScript = await this.loadInjectedScript();
    const script = injectedScript.script ?? injectedScript;
    const requestId = this.generateId();
    const CustomEventConstructor =
      this.document.defaultView?.CustomEvent ?? globalThis.CustomEvent;

    return new Promise((resolve) => {
      const handleResponse = (/** @type {Event} */ event) => {
        const responseDetail =
          /** @type {import("./types.js").StoreControllerResponseDetail} */ (
            JSON.parse(/** @type {CustomEvent} */ (event).detail)
          );

        if (responseDetail?.requestId !== requestId) {
          return;
        }

        script.removeEventListener(
          STORE_CONTROLLER_RESPONSE_EVENT,
          handleResponse,
        );
        resolve(responseDetail);
      };

      script.addEventListener(STORE_CONTROLLER_RESPONSE_EVENT, handleResponse);
      script.dispatchEvent(
        new CustomEventConstructor(STORE_CONTROLLER_REQUEST_EVENT, {
          detail: JSON.stringify(
            /** @type {import("./types.js").StoreControllerRequestDetail} */ ({
              ...detail,
              requestId,
            }),
          ),
        }),
      );
    });
  }
}
