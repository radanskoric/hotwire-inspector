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
        <button type="button" class="node-row" role="treeitem" data-controller="panel-node"
          data-action="mouseenter->panel-node#highlight mouseleave->panel-node#clearHighlight click->panel-node#inspect">
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
      { type: 'frame', controllers: ['lazy'] },
      { type: 'controller', controllers: ['modal', 'dropdown'] },
      { type: 'frame', controllers: [] },
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
    });

    app.renderTree([
      { type: 'frame', controllers: ['lazy'] },
      { type: 'controller', controllers: ['modal'] },
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
    expect(row.dataset.action).toBe('mouseenter->panel-node#highlight mouseleave->panel-node#clearHighlight click->panel-node#inspect');
    expect(row.dataset.panelNodeIdValue).toBe('frame-1');
  });

  it('does not render internal generated ids in node labels', () => {
    const app = createPanelApp({
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
    const app = createPanelApp({
      browserApi: createBrowserApi((message) => {
        sentMessages.push(message);
        return Promise.resolve({ items: [{ id: 'frame-1', type: 'frame' }] });
      }),
      buildTree: (items) => items.map((item) => ({ ...item, children: [] })),
    });

    await app.refreshTree();

    expect(sentMessages).toEqual([{
      type: RELAY_MESSAGE_TYPE,
      tabId: 42,
      message: { type: CONTENT_SCAN_MESSAGE_TYPE },
    }]);
    expect(summaryElement.textContent).toBe('1 frames, 0 controllers');
    expect(treeElement.children.length).toBe(1);
  });

  it('renders an empty tree when refresh returns no items', async () => {
    const app = createPanelApp({ buildTree: () => [] });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('0 frames, 0 controllers');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('shows an error message when refresh fails', async () => {
    const app = createPanelApp({
      browserApi: createBrowserApi(() => Promise.reject(new Error('boom'))),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('Unable to read the inspected page');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('shows an error message when the background relay fails', async () => {
    const app = createPanelApp({
      browserApi: createBrowserApi(() => Promise.resolve({
        type: RELAY_ERROR_TYPE,
        message: 'relay failed',
      })),
      buildTree: () => [],
    });

    await app.refreshTree();

    expect(summaryElement.textContent).toBe('Unable to read the inspected page');
    expect(emptyStateElement.hidden).toBe(false);
    expect(treeElement.hidden).toBe(true);
  });

  it('inspects a node via selector', async () => {
    const browserApi = createBrowserApi((relayMessage) => {
      if (relayMessage.message.type === CONTENT_INSPECT_MESSAGE_TYPE) {
        return Promise.resolve({ success: true, selector: '#frame-1' });
      }

      return Promise.resolve({ success: true });
    });
    const app = createPanelApp({
      browserApi,
      buildTree: () => [
        {
          id: 'frame-1',
          type: 'frame',
          controllers: [],
          children: [],
        },
      ],
    });

    await app.inspectNode('frame-1');

    expect(browserApi.devtools.inspectedWindow.evalCalls).toEqual([
      'inspect(document.querySelector("#frame-1"))',
    ]);
  });

  it('sends highlight messages for a node and clears them', async () => {
    const sentMessages = [];
    const app = createPanelApp({
      browserApi: createBrowserApi((message) => {
        sentMessages.push(message);
        return Promise.resolve({ success: true });
      }),
      buildTree: () => [
        {
          id: 'frame-1',
          type: 'frame',
          controllers: [],
          children: [],
        },
      ],
    });

    await app.highlightNode('frame-1');
    await app.clearHighlight();

    expect(sentMessages).toEqual([
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'frame-1' },
      },
      {
        type: RELAY_MESSAGE_TYPE,
        tabId: 42,
        message: { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE },
      },
    ]);
  });

  it('does not inspect when a node returns no selector', async () => {
    const browserApi = createBrowserApi(() => Promise.resolve({ success: false, selector: null }));
    const app = createPanelApp({
      browserApi,
      buildTree: () => [
        {
          id: 'frame-1',
          type: 'frame',
          controllers: [],
          children: [],
        },
      ],
    });

    await app.inspectNode('frame-1');

    expect(browserApi.devtools.inspectedWindow.evalCalls).toEqual([]);
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
