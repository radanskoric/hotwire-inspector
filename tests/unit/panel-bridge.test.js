import { describe, expect, it } from 'vitest';
import {
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  RELAY_ERROR_TYPE,
  RELAY_MESSAGE_TYPE,
} from '../../lib/constants.js';
import { PanelBridge } from '../../lib/panel-bridge.js';

function createBrowserApi(sendMessageImplementation, evalResult = { success: true, name: 'temp1' }) {
  const evalCalls = [];
  return {
    runtime: {
      sendMessage: sendMessageImplementation,
    },
    devtools: {
      inspectedWindow: {
        tabId: 42,
        eval(code, callback) {
          evalCalls.push(code);
          callback?.(evalResult);
        },
      },
    },
    evalCalls,
  };
}

describe('PanelBridge', () => {
  it('uses provided browserApi and reads tabId', () => {
    const browserApi = createBrowserApi(() => Promise.resolve({}));
    const bridge = new PanelBridge({ browserApi });

    expect(bridge.browser).toBe(browserApi);
    expect(bridge.tabId).toBe(42);
  });

  it('sendToInspectedTab sends relay message with correct structure', async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({ result: 'ok' });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.sendToInspectedTab({ type: 'test', data: 'value' });

    expect(sentMessages).toEqual([{
      type: RELAY_MESSAGE_TYPE,
      tabId: 42,
      message: { type: 'test', data: 'value' },
    }]);
    expect(response).toEqual({ result: 'ok' });
  });

  it('sendToInspectedTab throws error on RELAY_ERROR_TYPE response', async () => {
    const browserApi = createBrowserApi(() => Promise.resolve({
      type: RELAY_ERROR_TYPE,
      message: 'relay failed',
    }));
    const bridge = new PanelBridge({ browserApi });

    await expect(bridge.sendToInspectedTab({ type: 'test' })).rejects.toThrow('relay failed');
  });

  it('inspectElementBySelector escapes backslashes and quotes', () => {
    const browserApi = createBrowserApi(() => Promise.resolve({}));
    const bridge = new PanelBridge({ browserApi });

    bridge.inspectElementBySelector('div[data-attr="value"]');
    bridge.inspectElementBySelector('div\\:with\\:backslashes');
    bridge.inspectElementBySelector('div[both\\"and\\\\"]');

    expect(browserApi.evalCalls).toEqual([
      'inspect(document.querySelector("div[data-attr=\\"value\\"]"))',
      'inspect(document.querySelector("div\\\\:with\\\\:backslashes"))',
      'inspect(document.querySelector("div[both\\\\\\"and\\\\\\\\\\"]"))',
    ]);
  });

  it('inspectNode sends CONTENT_INSPECT_MESSAGE_TYPE and calls inspectElementBySelector on success with selector', async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      if (message.message?.type === CONTENT_INSPECT_MESSAGE_TYPE) {
        return Promise.resolve({ success: true, selector: '#frame-1' });
      }
      return Promise.resolve({ success: true });
    });
    const bridge = new PanelBridge({ browserApi });

    await bridge.inspectNode('frame-1');

    expect(sentMessages).toEqual([{
      type: RELAY_MESSAGE_TYPE,
      tabId: 42,
      message: { type: CONTENT_INSPECT_MESSAGE_TYPE, id: 'frame-1' },
    }]);
    expect(browserApi.evalCalls).toEqual([
      'inspect(document.querySelector("#frame-1"))',
    ]);
  });

  it('inspectNode does not call inspectElementBySelector when response lacks success', async () => {
    const browserApi = createBrowserApi(() => Promise.resolve({ success: false, selector: '#frame-1' }));
    const bridge = new PanelBridge({ browserApi });

    await bridge.inspectNode('frame-1');

    expect(browserApi.evalCalls).toEqual([]);
  });

  it('inspectNode does not call inspectElementBySelector when response lacks selector', async () => {
    const browserApi = createBrowserApi(() => Promise.resolve({ success: true, selector: null }));
    const bridge = new PanelBridge({ browserApi });

    await bridge.inspectNode('frame-1');

    expect(browserApi.evalCalls).toEqual([]);
  });

  it('storeControllerNode sends CONTENT_STORE_CONTROLLER_MESSAGE_TYPE to the content script', async () => {
    const sentMessages = [];
    const browserApi = createBrowserApi((message) => {
      sentMessages.push(message);
      return Promise.resolve({ success: true, name: 'temp3', identifier: 'modal' });
    });
    const bridge = new PanelBridge({ browserApi });

    const response = await bridge.storeControllerNode('modal-controller', 'modal');

    expect(sentMessages).toEqual([{
      type: RELAY_MESSAGE_TYPE,
      tabId: 42,
      message: { type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE, id: 'modal-controller', identifier: 'modal' },
    }]);
    expect(browserApi.evalCalls).toEqual([]);
    expect(response).toEqual({ success: true, name: 'temp3', identifier: 'modal' });
  });
});
