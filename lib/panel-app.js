import { browser as defaultBrowser } from "wxt/browser";
import {
  CONTENT_SCAN_MESSAGE_TYPE,
  ID_PREFIX,
  SCAN_REFRESHED_EVENT,
} from "./constants.js";
import { buildTree as defaultBuildTree } from "./tree-builder.js";

/**
 * @typedef {import("./types.js").ScanItem} ScanItem
 * @typedef {import("./types.js").ScanTarget} ScanTarget
 * @typedef {import("./types.js").TreeNode} TreeNode
 */

/**
 * Injectable dependencies and DOM references for PanelApp. The element
 * options fall back to lookups in the panel document (see
 * `entrypoints/panel/index.html`), which statically contains all of them.
 *
 * @typedef {object} PanelAppOptions
 * @property {Document} [document]
 * @property {import("wxt/browser").WxtBrowser} [browserApi]
 * @property {import("./panel-bridge.js").PanelBridge} bridge
 * @property {(items: ScanItem[]) => TreeNode[]} [buildTree]
 * @property {HTMLElement} [summaryElement]
 * @property {HTMLElement} [treeElement]
 * @property {HTMLElement} [emptyStateElement]
 * @property {HTMLElement} [refreshButton]
 * @property {HTMLTemplateElement} [nodeTemplate]
 * @property {HTMLTemplateElement} [badgeTemplate]
 */

export class PanelApp {
  /**
   * @param {PanelAppOptions} [options]
   */
  constructor(
    {
      document = globalThis.document,
      browserApi = defaultBrowser,
      bridge,
      buildTree = defaultBuildTree,
      summaryElement,
      treeElement,
      emptyStateElement,
      refreshButton,
      nodeTemplate,
      badgeTemplate,
      // The bridge is required in practice; the default only exists so the
      // options object itself can be omitted.
    } = /** @type {PanelAppOptions} */ ({}),
  ) {
    this.document = document;
    this.browser = browserApi;
    this.bridge = bridge;
    this.buildTree = buildTree;
    this.summaryElement =
      summaryElement ??
      /** @type {HTMLElement} */ (document.getElementById("summary"));
    this.treeElement =
      treeElement ??
      /** @type {HTMLElement} */ (document.getElementById("tree"));
    this.emptyStateElement =
      emptyStateElement ??
      /** @type {HTMLElement} */ (document.getElementById("empty-state"));
    this.refreshButton =
      refreshButton ??
      /** @type {HTMLElement} */ (document.getElementById("refresh-button"));
    this.nodeTemplate =
      nodeTemplate ??
      /** @type {HTMLTemplateElement} */ (
        document.getElementById("node-template")
      );
    this.badgeTemplate =
      badgeTemplate ??
      /** @type {HTMLTemplateElement} */ (
        document.getElementById("badge-template")
      );
    this.tabId = this.browser.devtools.inspectedWindow.tabId;
    /** @type {Set<string>} */
    this.collapsedNodeIds = new Set();
    /** @type {boolean} */
    this.refreshCooldown = false;
  }

  start() {
    this.refreshButton.addEventListener("click", () => {
      this.refreshTree();
    });

    this.bridge.onTreeChanged(() => this.throttledRefreshTree());

    this.refreshTree();
  }

  throttledRefreshTree() {
    if (this.refreshCooldown) {
      return;
    }

    this.refreshCooldown = true;
    this.refreshTree();

    setTimeout(() => {
      this.refreshCooldown = false;
    }, 50);
  }

  /**
   * @param {ScanItem[]} items
   */
  countItems(items) {
    return items.reduce(
      (counts, item) => {
        if (item.tagName === "turbo-frame") {
          counts.frames += 1;
        }

        counts.controllers += item.controllers?.length ?? 0;

        return counts;
      },
      { frames: 0, controllers: 0 },
    );
  }

  /**
   * @param {HTMLElement} container
   * @param {string[] | undefined} controllers
   * @param {string} nodeId
   */
  fillBadges(container, controllers, nodeId) {
    if (!controllers?.length) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.replaceChildren();

    for (const controller of controllers) {
      const badge = /** @type {HTMLElement} */ (
        /** @type {Element} */ (
          this.badgeTemplate.content.firstElementChild
        ).cloneNode(true)
      );
      badge.textContent = controller;
      badge.dataset.controller = "panel-node";
      badge.dataset.panelNodeIdValue = nodeId;
      badge.dataset.controllerIdentifier = controller;
      badge.dataset.action = "click->panel-node#showDetails";
      container.appendChild(badge);
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {ScanTarget[] | undefined} targets
   */
  fillTargetBadges(container, targets) {
    if (!targets?.length) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.replaceChildren();

    for (const target of targets) {
      const badge = this.document.createElement("span");
      badge.className = "target-badge";

      const icon = this.document.createElement("img");
      icon.src = "/icons/target.svg";
      icon.className = "icon target-badge-icon";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      badge.appendChild(icon);

      const label = this.document.createElement("span");
      label.textContent = `${target.controller}#${target.name}`;
      badge.appendChild(label);

      container.appendChild(badge);
    }
  }

  /**
   * @param {TreeNode} node
   * @returns {HTMLElement}
   */
  renderNode(node) {
    // All queried elements exist in `node-template` (see the panel HTML).
    const nodeElement = /** @type {HTMLElement} */ (
      /** @type {Element} */ (
        this.nodeTemplate.content.firstElementChild
      ).cloneNode(true)
    );
    const row = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".node-row")
    );
    const kind = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".node-kind")
    );
    const id = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".node-id")
    );
    const src = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".node-src")
    );
    const badgesContainer = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".badges")
    );
    const targetBadgesContainer = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".target-badges")
    );
    const children = /** @type {HTMLElement} */ (
      nodeElement.querySelector(".node-children")
    );

    nodeElement.dataset.nodeId = node.id;

    kind.textContent = node.tagName;
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

    this.fillBadges(badgesContainer, node.controllers, node.id);
    this.fillTargetBadges(targetBadgesContainer, node.targets);

    row.setAttribute("data-panel-node-id-value", node.id);

    if (node.children?.length) {
      children.hidden = false;

      for (const child of node.children) {
        children.appendChild(this.renderNode(child));
      }
    }

    return nodeElement;
  }

  /**
   * @param {ScanItem[]} items
   */
  renderTree(items) {
    this.captureTreeState();
    this.treeElement.replaceChildren();

    const tree = this.buildTree(items);
    const counts = this.countItems(items);

    this.summaryElement.textContent = `${counts.frames} frames, ${counts.controllers} controllers`;

    if (!tree.length) {
      this.emptyStateElement.hidden = false;
      this.treeElement.hidden = true;
      this.restoreTreeState();
      return;
    }

    this.emptyStateElement.hidden = true;
    this.treeElement.hidden = false;

    for (const node of tree) {
      this.treeElement.appendChild(this.renderNode(node));
    }

    this.restoreTreeState();
  }

  captureTreeState() {
    this.collapsedNodeIds.clear();

    for (const nodeElement of this.treeElement.querySelectorAll(
      ".node[data-node-id]",
    )) {
      const id = /** @type {HTMLElement} */ (nodeElement).dataset.nodeId;

      if (!id) {
        continue;
      }

      if (!nodeElement.classList.contains("expanded")) {
        this.collapsedNodeIds.add(id);
      }
    }
  }

  restoreTreeState() {
    const presentIds = new Set();

    for (const nodeElement of this.treeElement.querySelectorAll(
      ".node[data-node-id]",
    )) {
      const id = /** @type {HTMLElement} */ (nodeElement).dataset.nodeId;

      if (!id) {
        continue;
      }

      presentIds.add(id);

      if (this.collapsedNodeIds.has(id)) {
        nodeElement.classList.remove("expanded");
      }
    }
  }

  async refreshTree() {
    this.summaryElement.textContent = "Refreshing…";

    /** @type {ScanItem[]} */
    let items = [];

    try {
      const response =
        /** @type {import("./types.js").ScanResponse | undefined} */ (
          await this.bridge.sendToInspectedTab({
            type: CONTENT_SCAN_MESSAGE_TYPE,
          })
        );
      items = response?.items ?? [];
      this.renderTree(items);
    } catch (error) {
      console.error("[Hotwire Inspector panel] scan failed with: ", error);
      this.renderTree([]);
      this.summaryElement.textContent = "Unable to read the inspected page";
    }

    this.dispatchScanRefreshed(items);
  }

  /**
   * Notifies panel-internal listeners (e.g. the details panel) that the tree
   * was refreshed, so they can reconcile against the fresh scan data.
   *
   * @param {ScanItem[]} items
   */
  dispatchScanRefreshed(items) {
    /** @type {import("./types.js").ScanRefreshedDetail} */
    const detail = { items };
    this.document.dispatchEvent(
      new CustomEvent(SCAN_REFRESHED_EVENT, { detail }),
    );
  }
}
