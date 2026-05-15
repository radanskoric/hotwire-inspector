import { browser as defaultBrowser } from 'wxt/browser';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  ID_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from './constants.js';
import { buildTree as defaultBuildTree } from './tree-builder.js';

export class PanelApp {
  constructor({
    document = globalThis.document,
    browserApi = defaultBrowser,
    buildTree = defaultBuildTree,
    summaryElement,
    treeElement,
    emptyStateElement,
    refreshButton,
    nodeTemplate,
    badgeTemplate,
  } = {}) {
    this.document = document;
    this.browser = browserApi;
    this.buildTree = buildTree;
    this.summaryElement = summaryElement ?? document.getElementById('summary');
    this.treeElement = treeElement ?? document.getElementById('tree');
    this.emptyStateElement = emptyStateElement ?? document.getElementById('empty-state');
    this.refreshButton = refreshButton ?? document.getElementById('refresh-button');
    this.nodeTemplate = nodeTemplate ?? document.getElementById('node-template');
    this.badgeTemplate = badgeTemplate ?? document.getElementById('badge-template');
    this.tabId = this.browser.devtools.inspectedWindow.tabId;
  }

  start() {
    this.refreshButton.addEventListener('click', () => {
      this.refreshTree();
    });

    this.refreshTree();
  }

  async sendToInspectedTab(message) {
    const response = await this.browser.runtime.sendMessage({
      type: RELAY_MESSAGE_TYPE,
      tabId: this.tabId,
      message,
    });

    if (response?.type === RELAY_ERROR_TYPE) {
      throw new Error(response.message);
    }

    return response;
  }

  inspectElementBySelector(selector) {
    const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const code = `inspect(document.querySelector("${escapedSelector}"))`;
    this.browser.devtools.inspectedWindow.eval(code);
  }

  highlightNode(id) {
    return this.sendToInspectedTab({ type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id });
  }

  clearHighlight() {
    return this.sendToInspectedTab({ type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE });
  }

  async inspectNode(id) {
    const response = await this.sendToInspectedTab({ type: CONTENT_INSPECT_MESSAGE_TYPE, id });

    if (response?.success && response.selector) {
      this.inspectElementBySelector(response.selector);
    }
  }

  countItems(items) {
    return items.reduce(
      (counts, item) => {
        if (item.type === 'frame') {
          counts.frames += 1;
        }

        counts.controllers += item.controllers?.length ?? 0;

        return counts;
      },
      { frames: 0, controllers: 0 },
    );
  }

  fillBadges(container, controllers) {
    if (!controllers?.length) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.replaceChildren();

    for (const controller of controllers) {
      const badge = this.badgeTemplate.content.firstElementChild.cloneNode(true);
      badge.textContent = controller;
      container.appendChild(badge);
    }
  }

  renderNode(node) {
    const nodeElement = this.nodeTemplate.content.firstElementChild.cloneNode(true);
    const row = nodeElement.querySelector('.node-row');
    const kind = nodeElement.querySelector('.node-kind');
    const id = nodeElement.querySelector('.node-id');
    const src = nodeElement.querySelector('.node-src');
    const badgesContainer = nodeElement.querySelector('.badges');
    const children = nodeElement.querySelector('.node-children');

    kind.textContent = node.type;
    if (node.id?.startsWith(ID_PREFIX)) {
      id.hidden = true;
    } else {
      id.textContent = node.id;
      id.hidden = false;
    }

    if (node.src) {
      src.textContent = node.src;
      src.hidden = false;
    }

    this.fillBadges(badgesContainer, node.controllers);

    row.setAttribute('data-panel-node-id-value', node.id);

    if (node.children?.length) {
      children.hidden = false;

      for (const child of node.children) {
        children.appendChild(this.renderNode(child));
      }
    }

    return nodeElement;
  }

  renderTree(items) {
    this.treeElement.replaceChildren();

    const tree = this.buildTree(items);
    const counts = this.countItems(items);

    this.summaryElement.textContent = `${counts.frames} frames, ${counts.controllers} controllers`;

    if (!tree.length) {
      this.emptyStateElement.hidden = false;
      this.treeElement.hidden = true;
      return;
    }

    this.emptyStateElement.hidden = true;
    this.treeElement.hidden = false;

    for (const node of tree) {
      this.treeElement.appendChild(this.renderNode(node));
    }
  }

  async refreshTree() {
    this.summaryElement.textContent = 'Refreshing…';

    try {
      const response = await this.sendToInspectedTab({ type: CONTENT_SCAN_MESSAGE_TYPE });
      this.renderTree(response?.items ?? []);
    } catch (error) {
      console.error('[Hotwire Inspector panel] scan failed with: ', error);
      this.renderTree([]);
      this.summaryElement.textContent = 'Unable to read the inspected page';
    }
  }
}
