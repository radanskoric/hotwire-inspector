// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentInspector } from '../../lib/content-inspector.js';
import {
  ID_PREFIX,
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
} from '../../lib/constants.js';

describe('ContentInspector', () => {
  let cssEscape;

  beforeEach(() => {
    document.body.innerHTML = '';
    cssEscape = (value) => value.replace(/:/g, '\\:');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('can use global defaults with CSS escape and element node type', () => {
    const previousCss = globalThis.CSS;
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';

    globalThis.CSS = { escape: (value) => value.replace(/:/g, '\\:') };

    try {
      const inspector = new ContentInspector();
      inspector.scan();

      expect(inspector.inspect('frame:main')).toEqual({
        success: true,
        selector: '#frame\\:main',
      });
    } finally {
      globalThis.CSS = previousCss;
    }
  });

  it('falls back when CSS escape and Node globals are unavailable', () => {
    const previousCss = globalThis.CSS;
    const previousNode = globalThis.Node;
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';

    globalThis.CSS = undefined;
    globalThis.Node = undefined;

    try {
      const inspector = new ContentInspector({ document });
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
    document.body.innerHTML = '<turbo-frame id="main-frame"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

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
    document.body.innerHTML = '<turbo-frame id="main-frame" data-controller="sidebar frame-loader"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

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
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });

    const firstScan = inspector.scan();
    const secondScan = inspector.scan();

    const firstId = firstScan[0].id;
    expect(firstId).toMatch(new RegExp(`^${ID_PREFIX}-`));
    expect(secondScan[0].id).toBe(firstId);
  });

  it('stores weak references in the reverse element lookup', () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const controller = document.querySelector('[data-controller="modal"]');
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();
    const ref = inspector.elementsByKey.get(id);

    expect(ref).toBeInstanceOf(WeakRef);
    expect(ref.deref()).toBe(controller);
  });

  it('treats stale generated-key weak references as missing elements', () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();

    inspector.elementsByKey.set(id, { deref: () => undefined });

    expect(inspector.highlight(id)).toEqual({ success: false });
  });

  it('falls back to document id lookup when a weak reference is stale', () => {
    document.body.innerHTML = '<turbo-frame id="main-frame"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();
    inspector.elementsByKey.set('main-frame', { deref: () => undefined });

    expect(inspector.inspect('main-frame')).toEqual({
      success: true,
      selector: '#main-frame',
    });
  });

  it('builds parent-child relationships during scan', () => {
    document.body.innerHTML = `
      <turbo-frame id="parent-frame">
        <div data-controller="dropdown menu"></div>
      </turbo-frame>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    const items = inspector.scan();
    expect(items[0]).toEqual({
      id: 'parent-frame',
      src: null,
      parentId: null,
      tagName: 'turbo-frame',
      controllers: [],
    });
    expect(items[1]).toMatchObject({
      parentId: 'parent-frame',
      tagName: 'div',
      controllers: ['dropdown', 'menu'],
    });
    expect(items[1].id).toMatch(new RegExp(`^${ID_PREFIX}-`));
  });

  it('includes target elements found inside controller subtrees during scan', () => {
    document.body.innerHTML = `
      <section id="search-controller" data-controller="search">
        <input id="query-input" data-search-target="input result">
      </section>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'search-controller',
        parentId: null,
        tagName: 'section',
        controllers: ['search'],
      },
      {
        id: 'query-input',
        parentId: 'search-controller',
        tagName: 'input',
        controllers: [],
        targets: [
          { controller: 'search', name: 'input' },
          { controller: 'search', name: 'result' },
        ],
      },
    ]);
  });

  it('renders one scan item for elements with multiple controller target attributes', () => {
    document.body.innerHTML = `
      <div id="controller" data-controller="search tabs">
        <button id="shared-target" data-search-target="input" data-tabs-target="tab selectedTab"></button>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    const items = inspector.scan();
    const targetItems = items.filter((item) => item.id === 'shared-target');

    expect(targetItems).toHaveLength(1);
    expect(targetItems[0]).toMatchObject({
      parentId: 'controller',
      tagName: 'button',
      controllers: [],
      targets: [
        { controller: 'search', name: 'input' },
        { controller: 'tabs', name: 'tab' },
        { controller: 'tabs', name: 'selectedTab' },
      ],
    });
  });

  it('ignores target attributes with empty values during scan', () => {
    document.body.innerHTML = `
      <div id="controller" data-controller="search">
        <button id="empty-target" data-search-target=""></button>
        <input id="real-target" data-search-target="input">
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.scan()).toEqual([
      {
        id: 'controller',
        parentId: null,
        tagName: 'div',
        controllers: ['search'],
      },
      {
        id: 'real-target',
        parentId: 'controller',
        tagName: 'input',
        controllers: [],
        targets: [{ controller: 'search', name: 'input' }],
      },
    ]);
  });

  it('can inspect target-only elements discovered during scan', () => {
    document.body.innerHTML = `
      <div data-controller="modal">
        <button id="close-button" data-modal-target="closeButton"></button>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(inspector.inspect('close-button')).toEqual({
      success: true,
      selector: '#close-button',
    });
  });

  it('highlights and clears highlight with an overlay while preserving target inline styles', () => {
    document.body.innerHTML = `
      <div data-controller="modal" style="outline: 1px dashed red; outline-offset: 1px;"></div>
    `;
    const controller = document.querySelector('[data-controller="modal"]');
    controller.getBoundingClientRect = () => ({ top: 10, left: 20, width: 300, height: 40 });
    const inspector = new ContentInspector({ document, cssEscape });
    const [{ id }] = inspector.scan();

    expect(inspector.highlight(id)).toEqual({ success: true });
    expect(controller.style.outline).toBe('red dashed 1px');
    expect(controller.style.outlineOffset).toBe('1px');

    const overlay = document.body.lastElementChild;
    expect(overlay.style).toMatchObject({
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      outline: 'rgb(37, 99, 235) dashed 3px',
      background: 'rgba(37, 99, 235, 0.12)',
      borderRadius: '2px',
      top: '10px',
      left: '20px',
      width: '300px',
      height: '40px',
    });

    expect(inspector.clearHighlight()).toEqual({ success: true });
    expect(document.body.children).toHaveLength(1);
    expect(controller.style.outline).toBe('red dashed 1px');
    expect(controller.style.outlineOffset).toBe('1px');
  });

  it('returns a selector for inspect using escaped ids when available', () => {
    document.body.innerHTML = '<turbo-frame id="frame:main"></turbo-frame>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(inspector.inspect('frame:main')).toEqual({
      success: true,
      selector: '#frame\\:main',
    });
  });

  it('returns no selector when inspecting a missing element', () => {
    const inspector = new ContentInspector({ document, cssEscape });

    expect(inspector.inspect('missing')).toEqual({
      success: false,
      selector: null,
    });
  });

  it('builds a structural selector for elements without ids', () => {
    document.body.innerHTML = `
      <div>
        <div data-controller="first"></div>
        <div data-controller="second"></div>
      </div>
    `;
    const inspector = new ContentInspector({ document, cssEscape });
    const items = inspector.scan();

    expect(inspector.inspect(items[1].id)).toEqual({
      success: true,
      selector: 'html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2)',
    });
  });

  it('does not mutate target DOM attributes while scanning', () => {
    document.body.innerHTML = '<div data-controller="modal"></div>';
    const controller = document.querySelector('[data-controller="modal"]');
    const setAttributeSpy = vi.spyOn(controller, 'setAttribute');
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    expect(setAttributeSpy).not.toHaveBeenCalled();
  });

  it('round-trips controller storage via JSON stringified event details (Firefox compartment)', async () => {
    document.body.innerHTML = '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({ document, cssEscape, injectScript });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify({
          requestId: detail.requestId,
          success: true,
          name: 'temp1',
          identifier: 'modal',
        }),
      }));
    });

    inspector.scan();

    await expect(inspector.storeController('modal-controller', 'modal')).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
      name: 'temp1',
      identifier: 'modal',
    });
  });

  it('returns an error when storing a controller for a missing element', async () => {
    const inspector = new ContentInspector({ document, cssEscape });

    await expect(inspector.storeController('missing', 'modal')).resolves.toEqual({
      success: false,
      error: 'Element not found',
    });
  });

  it('stores a controller through the injected page script', async () => {
    document.body.innerHTML = '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({ document, cssEscape, injectScript });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify({
          requestId: 'unrelated-request',
          success: false,
        }),
      }));
      script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify({
          requestId: detail.requestId,
          success: true,
          name: 'temp1',
          identifier: 'modal',
        }),
      }));
    });

    inspector.scan();

    await expect(inspector.storeController('modal-controller', 'modal')).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
      name: 'temp1',
      identifier: 'modal',
    });
  });

  it('returns injected script loader failures as controller storage errors', async () => {
    document.body.innerHTML = '<div id="modal-controller" data-controller="modal"></div>';
    const inspector = new ContentInspector({ document, cssEscape });

    inspector.scan();

    await expect(inspector.storeController('modal-controller', 'modal')).resolves.toEqual({
      success: false,
      error: 'Injected page script loader unavailable',
    });
  });

  it('uses fallback storage error text and global CustomEvent when needed', async () => {
    document.body.innerHTML = '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    const injectScript = () => Promise.resolve({ script });
    const inspector = new ContentInspector({ document, cssEscape, injectScript });

    vi.spyOn(document, 'defaultView', 'get').mockReturnValue(null);
    inspector.sendStoreControllerRequest = async () => {
      throw new Error();
    };
    inspector.scan();

    await expect(inspector.storeController('modal-controller', 'modal')).resolves.toEqual({
      success: false,
      error: 'Controller storage failed',
    });

    inspector.sendStoreControllerRequest = ContentInspector.prototype.sendStoreControllerRequest;
    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify({
          requestId: detail.requestId,
          success: true,
        }),
      }));
    });

    await expect(inspector.storeController('modal-controller', 'modal')).resolves.toEqual({
      requestId: expect.any(String),
      success: true,
    });
  });

  it('reuses the injected script for subsequent controller storage requests', async () => {
    document.body.innerHTML = '<div id="modal-controller" data-controller="modal"></div>';
    const script = new EventTarget();
    let injectionCount = 0;
    const injectScript = () => {
      injectionCount += 1;
      return Promise.resolve(script);
    };
    const inspector = new ContentInspector({ document, cssEscape, injectScript });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);

      script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify({
          requestId: detail.requestId,
          success: true,
          name: `temp${injectionCount}`,
          identifier: 'modal',
        }),
      }));
    });

    inspector.scan();

    await inspector.storeController('modal-controller', 'modal');
    await inspector.storeController('modal-controller', 'modal');

    expect(injectionCount).toBe(1);
  });
});
