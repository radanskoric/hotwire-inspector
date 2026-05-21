import { ID_PREFIX, STORE_CONTROLLER_REQUEST_EVENT, STORE_CONTROLLER_RESPONSE_EVENT } from './constants.js';

export class ContentInspector {
  constructor({
    document = globalThis.document,
    crypto = globalThis.crypto,
    cssEscape = globalThis.CSS?.escape,
    elementNodeType = globalThis.Node?.ELEMENT_NODE ?? 1,
    injectScript = null,
  } = {}) {
    this.document = document;
    this.crypto = crypto;
    this.cssEscape = cssEscape ?? ((value) => value);
    this.elementNodeType = elementNodeType;
    this.elementKeys = new WeakMap();
    this.elementsByKey = new Map();
    this.highlightOverlay = null;
    this.injectScript = injectScript;
    this.injectedScriptPromise = null;
  }

  scan() {
    const elements = Array.from(this.document.querySelectorAll('turbo-frame, [data-controller]'));

    this.elementsByKey.clear();

    return elements.map((element) => {
      const parentId = this.getParentInspectableId(element);
      const controllers = this.parseControllers(element);
      const key = this.getElementKey(element);
      const tagName = element.tagName.toLowerCase();

      let info = {
        id: key,
        parentId,
        tagName,
        controllers,
      }

      if (tagName === 'turbo-frame') {
        info.src = element.getAttribute('src');
      }

      return info;
    });
  }

  highlight(id) {
    this.clearHighlight();

    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false };
    }

    const rect = element.getBoundingClientRect();
    const overlay = this.document.createElement('div');

    Object.assign(overlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      outline: '3px dashed rgb(37, 99, 235)',
      background: 'rgba(37, 99, 235, 0.12)',
      borderRadius: '2px',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    this.document.body.appendChild(overlay);
    this.highlightOverlay = overlay;

    return { success: true };
  }

  clearHighlight() {
    if (!this.highlightOverlay) {
      return { success: true };
    }

    this.highlightOverlay.remove();
    this.highlightOverlay = null;

    return { success: true };
  }

  inspect(id) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, selector: null };
    }

    return { success: true, selector: this.buildElementSelector(element) };
  }

  async storeController(id, identifier) {
    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    try {
      return await this.sendStoreControllerRequest({
        selector: this.buildElementSelector(element),
        identifier,
      });
    } catch (error) {
      return { success: false, error: error.message || 'Controller storage failed' };
    }
  }

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

    const generatedKey = `${ID_PREFIX}-${this.crypto.randomUUID()}`;
    this.elementKeys.set(element, generatedKey);
    this.elementsByKey.set(generatedKey, new WeakRef(element));
    return generatedKey;
  }

  getParentInspectableId(element) {
    const parent = element.parentElement?.closest('turbo-frame, [data-controller]');

    if (!parent) {
      return null;
    }

    return this.getElementKey(parent);
  }

  parseControllers(element) {
    const value = element.getAttribute('data-controller');

    if (!value) {
      return [];
    }

    return value
      .split(/\s+/)
      .map((controller) => controller.trim())
      .filter(Boolean);
  }

  findElementByKey(key) {
    const element = this.elementsByKey.get(key)?.deref();

    return element || this.document.getElementById(key);
  }

  buildElementSelector(element) {
    if (element.id) {
      return `#${this.cssEscape(element.id)}`;
    }

    const segments = [];
    let current = element;

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

    return segments.join(' > ');
  }

  loadInjectedScript() {
    if (!this.injectScript) {
      return Promise.reject(new Error('Injected page script loader unavailable'));
    }

    this.injectedScriptPromise ??= this.injectScript('/inspected-page-inject.js', { keepInDom: true });
    return this.injectedScriptPromise;
  }

  async sendStoreControllerRequest(detail) {
    const injectedScript = await this.loadInjectedScript();
    const script = injectedScript.script ?? injectedScript;
    const requestId = this.crypto.randomUUID();
    const CustomEventConstructor = this.document.defaultView?.CustomEvent ?? globalThis.CustomEvent;

    return new Promise((resolve) => {
      const handleResponse = (event) => {
        if (event.detail?.requestId !== requestId) {
          return;
        }

        script.removeEventListener(STORE_CONTROLLER_RESPONSE_EVENT, handleResponse);
        resolve(event.detail);
      };

      script.addEventListener(STORE_CONTROLLER_RESPONSE_EVENT, handleResponse);
      script.dispatchEvent(new CustomEventConstructor(STORE_CONTROLLER_REQUEST_EVENT, {
        detail: { ...detail, requestId },
      }));
    });
  }
}

