// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  ID_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from '../../lib/constants.js';
import { PanelApp } from '../../lib/panel-app.js';

function mountPanelDom() {
  document.body.innerHTML = `
    <div class="app">
      <header class="toolbar">
        <div>
          <h1>Hotwire Inspector</h1>
          <p id="summary">Loading…</p>
        </div>
        <div class="toolbar-actions">
          <label class="theme-control">
            <span>Theme</span>
            <select id="theme-select" class="theme-select" data-controller="theme" data-action="change->theme#setTheme">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button id="refresh-button" class="btn" type="button">Refresh</button>
        </div>
      </header>
      <main>
        <div id="empty-state" class="empty-state" hidden>No turbo frames or Stimulus controllers found.</div>
        <div id="tree" class="tree" role="tree"></div>
      </main>
    </div>
    <template id="node-template">
      <div class="node">
        <button type="button" class="node-row" role="treeitem" data-controller="panel-node">
          <img src="/icons/reveal-in-elements.svg" class="icon" />
          <span class="node-main">
            <span class="node-kind"></span>
            <span class="node-id"></span>
            <span class="node-src" hidden></span>
          </span>
          <span class="badges" hidden></span>
        </button>
        <div class="node-children" role="group" hidden></div>
      </div>
    </template>
    <template id="badge-template">
      <span class="badge"></span>
    </template>
  `;

  return {
    summaryElement: document.getElementById('summary'),
    treeElement: document.getElementById('tree'),
    emptyStateElement: document.getElementById('empty-state'),
    refreshButton: document.getElementById('refresh-button'),
    nodeTemplate: document.getElementById('node-template'),
    badgeTemplate: document.getElementById('badge-template'),
  };
}

function createBrowserApi(sendMessageImplementation) {
  return {
    runtime: {
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

function createBridge(sendToInspectedTabImplementation) {
  return {
    sendToInspectedTab: sendToInspectedTabImplementation,
  };
}

describe('PanelApp', () => {
  let summaryElement;
  let treeElement;
  let emptyStateElement;
  let refreshButton;
  let nodeTemplate;
  let badgeTemplate;

  function createPanelApp(options = {}) {
    return new PanelApp({
      browserApi: createBrowserApi(() => Promise.resolve({})),
      bridge: createBridge(() => Promise.resolve({})),
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
      ...options,
    });
  }

  beforeEach(() => {
    ({
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
    } = mountPanelDom());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses document lookups when elements and templates are not provided', () => {
    const app = new PanelApp({
      document,
      browserApi: createBrowserApi(() => Promise.resolve({})),
      bridge: createBridge(() => Promise.resolve({})),
    });

    expect(app.summaryElement).toBe(summaryElement);
    expect(app.treeElement).toBe(treeElement);
    expect(app.emptyStateElement).toBe(emptyStateElement);
    expect(app.refreshButton).toBe(refreshButton);
    expect(app.nodeTemplate).toBe(nodeTemplate);
    expect(app.badgeTemplate).toBe(badgeTemplate);
  });

  it('counts frames and controllers', () => {
    const app = createPanelApp();

    expect(app.countItems([
      { tagName: 'turbo-frame', controllers: ['lazy'] },
      { tagName: 'div', controllers: ['modal', 'dropdown'] },
      { tagName: 'turbo-frame', controllers: [] },
    ])).toEqual({ frames: 2, controllers: 3 });
  });

  it('renders empty state when there are no nodes', () => {
    const app = createPanelApp({ buildTree: () => [] });

    app.renderTree([]);

    expect(summaryElement.textContent).toBe('0 frames, 0 controllers');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
    expect(treeElement.children.length).toBe(0);
  });

  it('renders nodes and badges from the built tree', () => {
    const app = createPanelApp({
      buildTree: () => [
        {
          id: 'frame-1',
          tagName: 'turbo-frame',
          src: '/posts',
          controllers: ['lazy'],
          children: [
            {
              id: 'ctrl-1',
              tagName: 'div',
              controllers: ['modal'],
              children: [],
            },
          ],
        },
      ],
    });

    app.renderTree([
      { tagName: 'turbo-frame', controllers: ['lazy'] },
      { tagName: 'div', controllers: ['modal'] },
    ]);

    const rootNode = treeElement.children[0];
    const row = rootNode.querySelector('.node-row');
    const src = rootNode.querySelector('.node-src');
    const badges = rootNode.querySelector('.badges');
    const children = rootNode.querySelector('.node-children');

    expect(summaryElement.textContent).toBe('1 frames, 2 controllers');
    expect(emptyStateElement.hidden).toBe(true);
    expect(treeElement.hidden).toBe(false);
    expect(src.textContent).toBe('/posts');
    expect(src.hidden).toBe(false);
    expect(badges.hidden).toBe(false);
    expect(badges.children.length).toBe(1);
    expect(badges.children[0].textContent).toBe('lazy');
    expect(children.hidden).toBe(false);
    expect(children.children.length).toBe(1);
    expect(row.dataset.controller).toBe('panel-node');
    expect(row.dataset.panelNodeIdValue).toBe('frame-1');
  });

  it('does not render internal generated ids in node labels', () => {
    const app = createPanelApp({
      buildTree: () => [
        {
          id: `${ID_PREFIX}-uuid-1`,
          tagName: 'div',
          controllers: ['modal'],
          children: [],
        },
        {
          id: 'user-controller',
          tagName: 'div',
          controllers: ['menu'],
          children: [],
        },
      ],
    });

    app.renderTree([
      { tagName: 'div' },
      { tagName: 'div' },
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
    const app = createPanelApp({
      bridge: createBridge((message) => {
        sentMessages.push(message);
        return Promise.resolve({ items: [{ id: 'frame-1', tagName: 'turbo-frame' }] });
      }),
      buildTree: (items) => items.map((item) => ({ ...item, children: [] })),
    });

    await app.refreshTree();

    expect(sentMessages).toEqual([{ type: CONTENT_SCAN_MESSAGE_TYPE }]);
    expect(summaryElement.textContent).toBe('1 frames, 0 controllers');
    expect(treeElement.children.length).toBe(1);
  });

  it('renders an empty tree when refresh returns no items', async () => {
    const app = createPanelApp({
      bridge: createBridge(() => Promise.resolve({ items: [] })),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('0 frames, 0 controllers');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('renders an empty tree when refresh returns response without items', async () => {
    const app = createPanelApp({
      bridge: createBridge(() => Promise.resolve({})),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('0 frames, 0 controllers');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('shows an error message when refresh fails', async () => {
    const app = createPanelApp({
      bridge: createBridge(() => Promise.reject(new Error('boom'))),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('Unable to read the inspected page');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('shows an error message when the background relay fails', async () => {
    const app = createPanelApp({
      bridge: createBridge(() => Promise.reject(new Error('relay failed'))),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('Unable to read the inspected page');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('start wires the refresh button and triggers an initial refresh', async () => {
    const refreshCalls = [];
    const app = createPanelApp();

    app.refreshTree = async () => {
      refreshCalls.push('refresh');
    };

    app.start();
    refreshButton.dispatchEvent(new Event('click'));
    await Promise.resolve();

    expect(refreshCalls).toEqual(['refresh', 'refresh']);
  });
});
