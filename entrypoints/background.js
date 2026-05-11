import { browser } from 'wxt/browser';
import { RELAY_ERROR_TYPE, RELAY_MESSAGE_TYPE } from '../lib/constants.js';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || message.type !== RELAY_MESSAGE_TYPE) {
      return false;
    }

    browser.tabs.sendMessage(message.tabId, message.message)
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
});
