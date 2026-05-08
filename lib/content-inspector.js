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
    this.highlightedElement = null;
    this.previousOutline = '';
    this.previousOutlineOffset = '';
  }

  scan() {
    const elements = Array.from(this.document.querySelectorAll('turbo-frame, [data-controller]'));

    this.elementsByKey.clear();

    return elements.map((element) => {
      const parentId = this.getParentInspectableId(element);
      const controllers = this.parseControllers(element);
      const key = this.getElementKey(element);

      if (element.tagName.toLowerCase() === 'turbo-frame') {
        return {
          id: key,
          src: element.getAttribute('src'),
          parentId,
          type: 'frame',
          controllers,
        };
      }

      return {
        id: key,
        parentId,
        type: 'controller',
        controllers,
      };
    });
  }

  highlight(id) {
    this.clearHighlight();

    const element = this.findElementByKey(id);

    if (!element) {
      return { success: false };
    }

    this.highlightedElement = element;
    this.previousOutline = element.style.outline;
    this.previousOutlineOffset = element.style.outlineOffset;
    element.style.outline = '3px dashed #2563eb';
    element.style.outlineOffset = '2px';

    return { success: true };
  }

  clearHighlight() {
    if (!this.highlightedElement) {
      return { success: true };
    }

    this.highlightedElement.style.outline = this.previousOutline;
    this.highlightedElement.style.outlineOffset = this.previousOutlineOffset;
    this.highlightedElement = null;
    this.previousOutline = '';
    this.previousOutlineOffset = '';

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
      this.elementsByKey.set(element.id, element);
      return element.id;
    }

    const existingKey = this.elementKeys.get(element);

    if (existingKey) {
      this.elementsByKey.set(existingKey, element);
      return existingKey;
    }

    const generatedKey = `hotwire-inspector-${this.crypto.randomUUID()}`;
    this.elementKeys.set(element, generatedKey);
    this.elementsByKey.set(generatedKey, element);
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
    return this.elementsByKey.get(key) || this.document.getElementById(key);
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
