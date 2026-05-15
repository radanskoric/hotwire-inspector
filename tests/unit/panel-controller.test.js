// @vitest-environment happy-dom

import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PanelController } from '../../lib/panel/controllers/panel-controller.js';
import { PANEL_BRIDGE_PROPERTY } from '../../lib/constants.js';

describe('PanelController', () => {
  let application;
  let calls;
  let element;

  beforeEach(async () => {
    calls = [];
    document.body.innerHTML = '<div data-controller="test"></div>';
    document[PANEL_BRIDGE_PROPERTY] = {
      sendToInspectedTab(message) {
        calls.push(['sendToInspectedTab', message]);
        return Promise.resolve('sent');
      },
      inspectNode(id) {
        calls.push(['inspectNode', id]);
        return Promise.resolve('inspected');
      },
    };

    // Create a test controller that extends PanelController
    class TestController extends PanelController { }

    application = Application.start();
    application.register('test', TestController);
    element = document.querySelector('[data-controller="test"]');

    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = '';
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  it('provides access to the panel bridge via getter', () => {
    const controller = application.getControllerForElementAndIdentifier(element, 'test');
    expect(controller.bridge).toBe(document[PANEL_BRIDGE_PROPERTY]);
  });

  it('proxies sendToInspectedTab to the panel bridge', async () => {
    const controller = application.getControllerForElementAndIdentifier(element, 'test');
    const message = { type: 'test', data: 'value' };

    await controller.sendToInspectedTab(message);

    expect(calls).toEqual([['sendToInspectedTab', message]]);
  });

  it('proxies inspectNode to the panel bridge', async () => {
    const controller = application.getControllerForElementAndIdentifier(element, 'test');
    const id = 'node-123';

    await controller.inspectNode(id);

    expect(calls).toEqual([['inspectNode', id]]);
  });
});
