import { browser as defaultBrowser } from 'wxt/browser';
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from './constants.js';

// Implements communication with the content script, acting as a bridge between
// Panel UI and content.
export class PanelBridge {
  constructor({
    browserApi = defaultBrowser,
  } = {}) {
    this.browser = browserApi;
    this.tabId = this.browser.devtools.inspectedWindow.tabId;
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
}
