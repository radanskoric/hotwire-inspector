import { browser as defaultBrowser } from 'wxt/browser';
import { ID_PREFIX } from './constants.js';
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

  sendToInspectedTab(message) {
    return this.browser.tabs.sendMessage(this.tabId, message);
  }

  inspectElementBySelector(selector) {
    const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const code = `inspect(document.querySelector("${escapedSelector}"))`;
    this.browser.devtools.inspectedWindow.eval(code);
  }

  countItems(items) {
    return items.reduce(
      (counts, item) => {
        if (item.type === 'frame') {
          counts.frames += 1;
        }

        if (item.type === 'controller') {
          counts.controllers += 1;
        }

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

    row.addEventListener('mouseenter', () => {
      this.sendToInspectedTab({ type: 'hotwire-inspector:highlight', id: node.id });
    });

    row.addEventListener('mouseleave', () => {
      this.sendToInspectedTab({ type: 'hotwire-inspector:clear-highlight' });
    });

    row.addEventListener('click', async () => {
      const response = await this.sendToInspectedTab({ type: 'hotwire-inspector:inspect', id: node.id });

      if (response?.success && response.selector) {
        this.inspectElementBySelector(response.selector);
      }
    });

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
      const response = await this.sendToInspectedTab({ type: 'hotwire-inspector:scan' });
      this.renderTree(response?.items ?? []);
    } catch (_error) {
      this.renderTree([]);
      this.summaryElement.textContent = 'Unable to read the inspected page';
    }
  }
}
