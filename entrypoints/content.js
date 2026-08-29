import { browser } from "wxt/browser";
import { injectScript } from "wxt/utils/inject-script";
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
  CONTENT_EVENTS_PORT_NAME,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
} from "../lib/constants.js";
import { ContentInspector } from "../lib/content-inspector.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    const inspector = new ContentInspector({
      injectScript,
      connectPort: () =>
        browser.runtime.connect({ name: CONTENT_EVENTS_PORT_NAME }),
    });

    inspector.startTreeWatcher();
    inspector.startPageLifecycleWatcher();
    inspector.startTurboEventWatcher();

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === CONTENT_SCAN_MESSAGE_TYPE) {
        sendResponse({ items: inspector.scan() });
        return true;
      }

      if (message.type === CONTENT_HIGHLIGHT_MESSAGE_TYPE) {
        sendResponse(inspector.highlight(message.id));
        return true;
      }

      if (message.type === CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE) {
        sendResponse(inspector.clearHighlight());
        return true;
      }

      if (message.type === CONTENT_INSPECT_MESSAGE_TYPE) {
        sendResponse(inspector.inspect(message.id));
        return true;
      }

      if (message.type === CONTENT_STORE_CONTROLLER_MESSAGE_TYPE) {
        inspector
          .storeController(message.id, message.identifier)
          .then(sendResponse);
        return true;
      }

      if (message.type === CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE) {
        inspector
          .controllerValues(message.id, message.identifier)
          .then(sendResponse);
        return true;
      }

      if (message.type === CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE) {
        sendResponse(
          inspector.controllerTargets(message.id, message.identifier),
        );
        return true;
      }

      if (message.type === CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE) {
        inspector
          .controllerOutlets(message.id, message.identifier)
          .then(sendResponse);
        return true;
      }

      if (message.type === CONTENT_WATCH_VALUES_MESSAGE_TYPE) {
        inspector
          .watchValues(message.id, message.identifier)
          .then(sendResponse);
        return true;
      }

      if (message.type === CONTENT_UNWATCH_VALUES_MESSAGE_TYPE) {
        sendResponse(inspector.unwatchValues());
        return true;
      }

      return false;
    });
  },
});
