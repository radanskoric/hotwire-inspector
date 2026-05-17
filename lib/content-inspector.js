import { ID_PREFIX } from './constants.js';

export class ContentInspector {
  constructor({
    document = globalThis.document,
    crypto = globalThis.crypto,
    cssEscape = globalThis.CSS?.escape,
    elementNodeType = globalThis.Node?.ELEMENT_NODE ?? 1,
  } = {}) {
    this.document = document;
    this.crypto = crypto;
    this.cssEscape = cssEscape ?? ((value) => value);
    this.elementNodeType = elementNodeType;
    this.elementKeys = new WeakMap();
    this.elementsByKey = new Map();
    this.highlightOverlay = null;
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
}
