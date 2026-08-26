import { browser } from "wxt/browser";
import {
  CONTENT_EVENTS_PORT_NAME,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  PANEL_EVENTS_PORT_NAME_PREFIX,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from "../lib/constants.js";
import { handleTabUpdated } from "../lib/background-handler.js";

/** @type {Map<number, import("wxt/browser").Browser.runtime.Port>} */
const panelPortsByTab = new Map();

/** @type {Map<number, import("wxt/browser").Browser.runtime.Port>} */
const contentPortsByTab = new Map();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      message.type !== RELAY_MESSAGE_TYPE
    ) {
      return false;
    }

    browser.tabs
      .sendMessage(message.tabId, message.message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        sendResponse({
          type: RELAY_ERROR_TYPE,
          message: error?.message ?? String(error),
        });
      });

    return true;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name.startsWith(PANEL_EVENTS_PORT_NAME_PREFIX)) {
      const tabId = Number(
        port.name.slice(PANEL_EVENTS_PORT_NAME_PREFIX.length),
      );
      panelPortsByTab.set(tabId, port);
      port.onDisconnect.addListener(() => {
        if (panelPortsByTab.get(tabId) === port) {
          panelPortsByTab.delete(tabId);
          browser.tabs
            .sendMessage(tabId, { type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE })
            .catch(() => {});
        }
      });
      return;
    }

    if (port.name === CONTENT_EVENTS_PORT_NAME) {
      const tabId = port.sender?.tab?.id;

      if (tabId == null) {
        port.disconnect();
        return;
      }

      contentPortsByTab.set(tabId, port);
      port.onMessage.addListener((message) => {
        panelPortsByTab.get(tabId)?.postMessage(message);
      });
      port.onDisconnect.addListener(() => {
        if (contentPortsByTab.get(tabId) === port) {
          contentPortsByTab.delete(tabId);
        }
      });
    }
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    handleTabUpdated(panelPortsByTab, tabId, changeInfo);
  });
});
