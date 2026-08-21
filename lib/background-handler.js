import { TREE_CHANGED_PUSH_TYPE } from "./constants.js";

/**
 * Sends a tree-changed push to the panel for a tab when the tab finishes
 * loading (e.g. after a reload or navigation).
 *
 * @param {Map<number, import("./types.js").PortLike>} panelPortsByTab
 * @param {number} tabId
 * @param {{ status?: string }} changeInfo
 */
export function handleTabUpdated(panelPortsByTab, tabId, changeInfo) {
  if (changeInfo.status === "complete") {
    panelPortsByTab.get(tabId)?.postMessage({ type: TREE_CHANGED_PUSH_TYPE });
  }
}
