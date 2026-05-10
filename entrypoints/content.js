import { browser } from 'wxt/browser';
import { ContentInspector } from '../lib/content-inspector.js';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const inspector = new ContentInspector();

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      if (message.type === 'hotwire-inspector:scan') {
        sendResponse({ items: inspector.scan() });
        return true;
      }

      if (message.type === 'hotwire-inspector:highlight') {
        sendResponse(inspector.highlight(message.id));
        return true;
      }

      if (message.type === 'hotwire-inspector:clear-highlight') {
        sendResponse(inspector.clearHighlight());
        return true;
      }

      if (message.type === 'hotwire-inspector:inspect') {
        sendResponse(inspector.inspect(message.id));
        return true;
      }

      return false;
    });
  },
});
