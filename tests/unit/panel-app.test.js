import { beforeEach, describe, expect, it } from 'vitest';
import { ID_PREFIX } from '../../lib/constants.js';
import { PanelApp } from '../../lib/panel-app.js';

class FakeElement {
  constructor(tagName, { id = '', className = '', textContent = '', hidden = false } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.textContent = textContent;
    this.hidden = hidden;
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];

    for (const child of children) {
      this.appendChild(child);
    }
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  querySelector(selector) {
    if (!selector.startsWith('.')) {
      return null;
    }

    const className = selector.slice(1);
    const queue = [...this.children];

    while (queue.length) {
      const element = queue.shift();

      if (element.className.split(/\s+/).includes(className)) {
        return element;
      }

      queue.push(...element.children);
    }

    return null;
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName, {
      id: this.id,
      className: this.className,
      textContent: this.textContent,
      hidden: this.hidden,
    });

    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true));
      }
    }

    return clone;
  }
}

function createNodeTemplate() {
  const node = new FakeElement('div', { className: 'node' });
  const row = new FakeElement('button', { className: 'node-row' });
  const main = new FakeElement('span', { className: 'node-main' });
  const kind = new FakeElement('span', { className: 'node-kind' });
  const id = new FakeElement('span', { className: 'node-id' });
  const src = new FakeElement('span', { className: 'node-src', hidden: true });
  const badges = new FakeElement('span', { className: 'badges', hidden: true });
  const children = new FakeElement('div', { className: 'node-children', hidden: true });

  main.appendChild(kind);
  main.appendChild(id);
  main.appendChild(src);
  row.appendChild(main);
  row.appendChild(badges);
  node.appendChild(row);
  node.appendChild(children);

  return {
    content: {
      firstElementChild: node,
    },
  };
}

function createBadgeTemplate() {
  return {
    content: {
      firstElementChild: new FakeElement('span', { className: 'badge' }),
    },
  };
}

function createChromeApi(sendMessageImplementation) {
  return {
    tabs: {
      sendMessage: sendMessageImplementation,
    },
    devtools: {
      inspectedWindow: {
        tabId: 42,
        evalCalls: [],
        eval(code) {
          this.evalCalls.push(code);
        },
      },
    },
  };
}

describe('PanelApp', () => {
  let summaryElement;
  let treeElement;
  let emptyStateElement;
  let refreshButton;
  let nodeTemplate;
  let badgeTemplate;

  beforeEach(() => {
    summaryElement = new FakeElement('p');
    treeElement = new FakeElement('div');
    emptyStateElement = new FakeElement('div', { hidden: true });
    refreshButton = new FakeElement('button');
    nodeTemplate = createNodeTemplate();
    badgeTemplate = createBadgeTemplate();
  });

  it('counts frames and controllers', () => {
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.resolve({})),
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    expect(app.countItems([
      { type: 'frame' },
      { type: 'controller' },
      { type: 'frame' },
    ])).toEqual({ frames: 2, controllers: 1 });
  });

  it('renders empty state when there are no nodes', () => {
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.resolve({})),
      buildTree: () => [],
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    app.renderTree([]);

    expect(summaryElement.textContent).toBe('0 frames, 0 controllers');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
    expect(treeElement.children).toHaveLength(0);
  });

  it('renders nodes and badges from the built tree', () => {
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.resolve({})),
      buildTree: () => [
        {
          id: 'frame-1',
          type: 'frame',
          src: '/posts',
          controllers: ['lazy'],
          children: [
            {
              id: 'ctrl-1',
              type: 'controller',
              controllers: ['modal'],
              children: [],
            },
          ],
        },
      ],
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    app.renderTree([
      { type: 'frame' },
      { type: 'controller' },
    ]);

    const rootNode = treeElement.children[0];
    const row = rootNode.querySelector('.node-row');
    const src = rootNode.querySelector('.node-src');
    const badges = rootNode.querySelector('.badges');
    const children = rootNode.querySelector('.node-children');

    expect(summaryElement.textContent).toBe('1 frames, 1 controllers');
    expect(emptyStateElement.hidden).toBe(true);
    expect(treeElement.hidden).toBe(false);
    expect(src.textContent).toBe('/posts');
    expect(src.hidden).toBe(false);
    expect(badges.hidden).toBe(false);
    expect(badges.children).toHaveLength(1);
    expect(badges.children[0].textContent).toBe('lazy');
    expect(children.hidden).toBe(false);
    expect(children.children).toHaveLength(1);
    expect(row.listeners.has('mouseenter')).toBe(true);
    expect(row.listeners.has('mouseleave')).toBe(true);
    expect(row.listeners.has('click')).toBe(true);
  });

  it('does not render internal generated ids in node labels', () => {
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.resolve({})),
      buildTree: () => [
        {
          id: `${ID_PREFIX}-uuid-1`,
          type: 'controller',
          controllers: ['modal'],
          children: [],
        },
        {
          id: 'user-controller',
          type: 'controller',
          controllers: ['menu'],
          children: [],
        },
      ],
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    app.renderTree([
      { type: 'controller' },
      { type: 'controller' },
    ]);

    const internalId = treeElement.children[0].querySelector('.node-id');
    const userId = treeElement.children[1].querySelector('.node-id');

    expect(internalId.textContent).toBe('');
    expect(internalId.hidden).toBe(true);
    expect(userId.textContent).toBe('user-controller');
    expect(userId.hidden).toBe(false);
  });

  it('refreshes by requesting a scan and then rendering the result', async () => {
    const sentMessages = [];
    const app = new PanelApp({
      chromeApi: createChromeApi((tabId, message) => {
        sentMessages.push({ tabId, message });
        return Promise.resolve({ items: [{ id: 'frame-1', type: 'frame' }] });
      }),
      buildTree: (items) => items.map((item) => ({ ...item, children: [] })),
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    await app.refreshTree();

    expect(sentMessages).toEqual([
      {
        tabId: 42,
        message: { type: 'hotwire-inspector:scan' },
      },
    ]);
    expect(summaryElement.textContent).toBe('1 frames, 0 controllers');
    expect(treeElement.children).toHaveLength(1);
  });

  it('shows an error message when refresh fails', async () => {
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.reject(new Error('boom'))),
      buildTree: () => [],
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('Unable to read the inspected page');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('inspects via selector when a rendered row is clicked', async () => {
    const chromeApi = createChromeApi((_tabId, message) => {
      if (message.type === 'hotwire-inspector:inspect') {
        return Promise.resolve({ success: true, selector: '#frame-1' });
      }

      return Promise.resolve({ success: true });
    });
    const app = new PanelApp({
      chromeApi,
      buildTree: () => [
        {
          id: 'frame-1',
          type: 'frame',
          controllers: [],
          children: [],
        },
      ],
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    app.renderTree([{ type: 'frame' }]);

    const row = treeElement.children[0].querySelector('.node-row');
    await row.listeners.get('click')();

    expect(chromeApi.devtools.inspectedWindow.evalCalls).toEqual([
      'inspect(document.querySelector("#frame-1"))',
    ]);
  });

  it('start wires the refresh button and triggers an initial refresh', async () => {
    const refreshCalls = [];
    const app = new PanelApp({
      chromeApi: createChromeApi(() => Promise.resolve({ items: [] })),
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    });

    app.refreshTree = async () => {
      refreshCalls.push('refresh');
    };

    app.start();
    await refreshButton.listeners.get('click')();

    expect(refreshCalls).toEqual(['refresh', 'refresh']);
  });
});
