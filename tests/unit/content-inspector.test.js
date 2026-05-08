import { describe, it, expect, beforeEach } from 'vitest';
import { ContentInspector } from '../../lib/content-inspector.js';

function createElement(tagName, { id = '', attributes = {}, style = {}, nodeType = 1 } = {}) {
  const attributeMap = new Map(Object.entries(attributes));

  const element = {
    id,
    tagName: tagName.toUpperCase(),
    nodeType,
    style: {
      outline: style.outline ?? '',
      outlineOffset: style.outlineOffset ?? '',
    },
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
  return {
    querySelectorAll(selector) {
      if (selector !== 'turbo-frame, [data-controller]') {
        return [];
      }

      return elements.filter((element) => element.tagName === 'TURBO-FRAME' || element.getAttribute('data-controller'));
    },
    getElementById(id) {
      return elements.find((element) => element.id === id) ?? null;
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

  it('uses real element ids when present during scan', () => {
    const frame = createElement('turbo-frame', { id: 'main-frame' });
    const document = createDocument([frame]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'main-frame',
        src: null,
        parentId: null,
        type: 'frame',
        controllers: [],
      },
    ]);
  });

  it('generates stable in-memory keys for elements without ids', () => {
    const controller = createElement('div', { attributes: { 'data-controller': 'modal' } });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });

    const firstScan = inspector.scan();
    const secondScan = inspector.scan();

    expect(firstScan[0].id).toBe('hotwire-inspector-uuid-1');
    expect(secondScan[0].id).toBe('hotwire-inspector-uuid-1');
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
        type: 'frame',
        controllers: [],
      },
      {
        id: 'hotwire-inspector-uuid-1',
        parentId: 'parent-frame',
        type: 'controller',
        controllers: ['dropdown', 'menu'],
      },
    ]);
  });

  it('highlights and clears highlight while restoring previous inline styles', () => {
    const controller = createElement('div', {
      attributes: { 'data-controller': 'modal' },
      style: { outline: '1px dashed red', outlineOffset: '1px' },
    });
    const document = createDocument([controller]);
    const inspector = new ContentInspector({ document, crypto, cssEscape });
    const [{ id }] = inspector.scan();

    expect(inspector.highlight(id)).toEqual({ success: true });
    expect(controller.style.outline).toBe('3px dashed #2563eb');
    expect(controller.style.outlineOffset).toBe('2px');

    expect(inspector.clearHighlight()).toEqual({ success: true });
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
