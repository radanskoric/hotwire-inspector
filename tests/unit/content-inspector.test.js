import { describe, it, expect, beforeEach } from 'vitest';
import { ContentInspector } from '../../lib/content-inspector.js';
import { ID_PREFIX } from '../../lib/constants.js';

function createElement(
  tagName,
  { id = '', attributes = {}, style = {}, nodeType = 1, rect = { top: 0, left: 0, width: 0, height: 0 } } = {},
) {
  const attributeMap = new Map(Object.entries(attributes));

  const element = {
    id,
    tagName: tagName.toUpperCase(),
    nodeType,
    style: { ...style },
    parentElement: null,
    previousElementSibling: null,
    children: [],
    getAttribute(name) {
      return attributeMap.has(name) ? attributeMap.get(name) : null;
    },
    appendChild(child) {
      const previousChild = this.children[this.children.length - 1] ?? null;
      child.parentElement = this;
      child.previousElementSibling = previousChild;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentElement) {
        return;
      }

      const siblings = this.parentElement.children;
      const index = siblings.indexOf(this);

      if (index !== -1) {
        siblings.splice(index, 1);
      }

      this.parentElement = null;
      this.previousElementSibling = null;
    },
    getBoundingClientRect() {
      return rect;
    },
    closest(selector) {
      let current = this;

      while (current) {
        const matchesTurboFrame = selector.includes('turbo-frame') && current.tagName === 'TURBO-FRAME';
        const matchesController = selector.includes('[data-controller]') && current.getAttribute('data-controller');

        if (matchesTurboFrame || matchesController) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    },
  };

  return element;
}

function createDocument(elements) {
  const body = createElement('body');

  return {
    body,
    querySelectorAll(selector) {
      if (selector !== 'turbo-frame, [data-controller]') {
        return [];
      }

      return elements.filter((element) => element.tagName === 'TURBO-FRAME' || element.getAttribute('data-controller'));
    },
    getElementById(id) {
      return elements.find((element) => element.id === id) ?? null;
    },
    createElement(tagName) {
      return createElement(tagName);
    },
  };
}

describe('ContentInspector', () => {
  let uuid = 0;
  let crypto;
  let cssEscape;

  beforeEach(() => {
    uuid = 0;
    crypto = {
      randomUUID() {
        uuid += 1;
        return `uuid-${uuid}`;
      },
    };
    cssEscape = (value) => value.replace(/:/g, '\\:');
  });

  it('can use global defaults with CSS escape and element node type', () => {
    const previousDocument = globalThis.document;
    const previousCrypto = globalThis.crypto;
    const previousCss = globalThis.CSS;
    const previousNode = globalThis.Node;
    const frame = createElement('turbo-frame', { id: 'frame:main' });
    const document = createDocument([frame]);

    globalThis.document = document;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: crypto,
    });
    globalThis.CSS = { escape: (value) => value.replace(/:/g, '\\:') };
    globalThis.Node = { ELEMENT_NODE: 1 };

    try {
      const inspector = new ContentInspector();
      inspector.scan();

      expect(inspector.inspect('frame:main')).toEqual({
        success: true,
        selector: '#frame\\:main',
      });
    } finally {
      globalThis.document = previousDocument;
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: previousCrypto,
      });
      globalThis.CSS = previousCss;
      globalThis.Node = previousNode;
    }
  });

  it('falls back when CSS escape and Node globals are unavailable', () => {
    const previousCss = globalThis.CSS;
    const previousNode = globalThis.Node;
    const frame = createElement('turbo-frame', { id: 'frame:main' });
    const document = createDocument([frame]);

    globalThis.CSS = undefined;
    globalThis.Node = undefined;

    try {
      const inspector = new ContentInspector({ document, crypto });
      inspector.scan();

      expect(inspector.inspect('frame:main')).toEqual({
        success: true,
        selector: '#frame:main',
      });
    } finally {
      globalThis.CSS = previousCss;
      globalThis.Node = previousNode;
    }
  });

  it('uses real element ids when present during scan', () => {
    const frame = createElement('turbo-frame', { id: 'main-frame' });
    const document = createDocument([frame]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'main-frame',
        src: null,
        parentId: null,
        tagName: 'turbo-frame',
        controllers: [],
      },
    ]);
  });

  it('includes controllers attached directly to frames during scan', () => {
    const frame = createElement('turbo-frame', {
      id: 'main-frame',
      attributes: { 'data-controller': 'sidebar frame-loader' },
    });
    const document = createDocument([frame]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'main-frame',
        src: null,
        parentId: null,
        tagName: 'turbo-frame',
        controllers: ['sidebar', 'frame-loader'],
      },
    ]);
  });

  it('generates stable in-memory keys for elements without ids', () => {
    const controller = createElement('div', { attributes: { 'data-controller': 'modal' } });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    const firstScan = inspector.scan();
    const secondScan = inspector.scan();

    expect(firstScan[0].id).toBe(`${ID_PREFIX}-uuid-1`);
    expect(secondScan[0].id).toBe(`${ID_PREFIX}-uuid-1`);
  });

  it('stores weak references in the reverse element lookup', () => {
    const controller = createElement('div', { attributes: { 'data-controller': 'modal' } });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });
    const [{ id }] = inspector.scan();
    const ref = inspector.elementsByKey.get(id);

    expect(ref).toBeInstanceOf(WeakRef);
    expect(ref.deref()).toBe(controller);
  });

  it('treats stale generated-key weak references as missing elements', () => {
    const controller = createElement('div', { attributes: { 'data-controller': 'modal' } });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });
    const [{ id }] = inspector.scan();

    inspector.elementsByKey.set(id, { deref: () => undefined });

    expect(inspector.highlight(id)).toEqual({ success: false });
  });

  it('falls back to document id lookup when a weak reference is stale', () => {
    const frame = createElement('turbo-frame', { id: 'main-frame' });
    const document = createDocument([frame]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    inspector.scan();
    inspector.elementsByKey.set('main-frame', { deref: () => undefined });

    expect(inspector.inspect('main-frame')).toEqual({
      success: true,
      selector: '#main-frame',
    });
  });

  it('builds parent-child relationships during scan', () => {
    const frame = createElement('turbo-frame', { id: 'parent-frame' });
    const controller = createElement('div', { attributes: { 'data-controller': 'dropdown menu' } });
    frame.appendChild(controller);
    const document = createDocument([frame, controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'parent-frame',
        src: null,
        parentId: null,
        tagName: 'turbo-frame',
        controllers: [],
      },
      {
        id: `${ID_PREFIX}-uuid-1`,
        parentId: 'parent-frame',
        tagName: 'div',
        controllers: ['dropdown', 'menu'],
      },
    ]);
  });

  it('highlights and clears highlight with an overlay while preserving target inline styles', () => {
    const controller = createElement('div', {
      attributes: { 'data-controller': 'modal' },
      style: { outline: '1px dashed red', outlineOffset: '1px' },
      rect: { top: 10, left: 20, width: 300, height: 40 },
    });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });
    const [{ id }] = inspector.scan();

    expect(inspector.highlight(id)).toEqual({ success: true });
    expect(controller.style.outline).toBe('1px dashed red');
    expect(controller.style.outlineOffset).toBe('1px');

    const overlay = document.body.children[0];
    expect(overlay.style).toMatchObject({
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      outline: '3px dashed rgb(37, 99, 235)',
      background: 'rgba(37, 99, 235, 0.12)',
      borderRadius: '2px',
      top: '10px',
      left: '20px',
      width: '300px',
      height: '40px',
    });

    expect(inspector.clearHighlight()).toEqual({ success: true });
    expect(document.body.children).toHaveLength(0);
    expect(controller.style.outline).toBe('1px dashed red');
    expect(controller.style.outlineOffset).toBe('1px');
  });

  it('returns a selector for inspect using escaped ids when available', () => {
    const frame = createElement('turbo-frame', { id: 'frame:main' });
    const document = createDocument([frame]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    inspector.scan();

    expect(inspector.inspect('frame:main')).toEqual({
      success: true,
      selector: '#frame\\:main',
    });
  });

  it('returns no selector when inspecting a missing element', () => {
    const document = createDocument([]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    expect(inspector.inspect('missing')).toEqual({
      success: false,
      selector: null,
    });
  });

  it('builds a structural selector for elements without ids', () => {
    const html = createElement('html');
    const body = createElement('body');
    const wrapper = createElement('div');
    const firstController = createElement('div', { attributes: { 'data-controller': 'first' } });
    const secondController = createElement('div', { attributes: { 'data-controller': 'second' } });

    html.appendChild(body);
    body.appendChild(wrapper);
    wrapper.appendChild(firstController);
    wrapper.appendChild(secondController);

    const document = createDocument([firstController, secondController]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });
    const items = inspector.scan();

    expect(inspector.inspect(items[1].id)).toEqual({
      success: true,
      selector: 'html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2)',
    });
  });

  it('does not mutate target DOM attributes while scanning', () => {
    const observedCalls = [];
    const controller = createElement('div', { attributes: { 'data-controller': 'modal' } });
    controller.setAttribute = (...args) => {
      observedCalls.push(args);
    };
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    inspector.scan();

    expect(observedCalls).toEqual([]);
  });
});
