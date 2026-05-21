// @vitest-environment happy-dom

import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeController } from '../../lib/panel/controllers/node-controller.js';
import { PanelNodeController } from '../../lib/panel/controllers/panel-node-controller.js';
import { registerPanelControllers } from '../../lib/panel/controllers/index.js';
import { ThemeController } from '../../lib/panel/controllers/theme-controller.js';
import {
  PANEL_BRIDGE_PROPERTY,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
} from '../../lib/constants.js';

describe('PanelNodeController', () => {
  let application;
  let calls;
  let button;

  beforeEach(async () => {
    calls = [];
    document.body.innerHTML = `
      <template id="notice-template">
        <div class="status-notice" data-controller="status" role="status" aria-live="polite">
          <span slot="text"></span>
        </div>
      </template>
      <button
        data-controller="panel-node"
        data-panel-node-id-value="frame-1"
        data-action="mouseenter->panel-node#highlight mouseleave->panel-node#clearHighlight click->panel-node#inspect"
      ></button>
    `;
    document[PANEL_BRIDGE_PROPERTY] = {
      sendToInspectedTab(message) {
        calls.push(['sendToInspectedTab', message]);
        return Promise.resolve('sent');
      },
      inspectNode(id) {
        calls.push(['inspectNode', id]);
        return Promise.resolve('inspected');
      },
      storeControllerNode(id, identifier) {
        calls.push(['storeControllerNode', id, identifier]);
        return Promise.resolve({ success: true, name: 'temp1', identifier });
      },
    };
    application = Application.start();
    application.register('panel-node', PanelNodeController);
    button = document.querySelector('[data-controller="panel-node"]');

    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = '';
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  it('highlights the node through the panel app', async () => {
    button.dispatchEvent(new Event('mouseenter'));
    await Promise.resolve();

    expect(calls).toEqual([['sendToInspectedTab', { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: 'frame-1' }]]);
  });

  it('clears the current highlight through the panel app', async () => {
    button.dispatchEvent(new Event('mouseleave'));
    await Promise.resolve();

    expect(calls).toEqual([['sendToInspectedTab', { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE }]]);
  });

  it('inspects the node through the panel app', async () => {
    button.setAttribute('data-panel-node-id-value', 'ctrl-1');
    button.dispatchEvent(new Event('click'));
    await Promise.resolve();

    expect(calls).toEqual([['inspectNode', 'ctrl-1']]);
  });

  it('stores a controller from a badge click without inspecting the row', async () => {
    button.innerHTML = '<span class="badge" data-controller-identifier="modal" data-action="click->panel-node#storeController">modal</span>';
    const badge = button.querySelector('.badge');
    await Promise.resolve();

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(calls).toEqual([['storeControllerNode', 'frame-1', 'modal']]);
  });

  it('shows success feedback in status element on successful controller storage', async () => {
    button.innerHTML = '<span class="badge" data-controller-identifier="modal" data-action="click->panel-node#storeController">modal</span>';
    const badge = button.querySelector('.badge');
    await Promise.resolve();

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const statusElement = document.querySelector('.status-notice');
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain('modal controller instance stored as temp1');
    expect(statusElement.hidden).toBe(false);
  });

  it('returns storage result without rendering feedback when notice template is unavailable', async () => {
    document.getElementById('notice-template').remove();
    button.innerHTML = '<span class="badge" data-controller-identifier="modal" data-action="click->panel-node#storeController">modal</span>';
    const badge = button.querySelector('.badge');
    await Promise.resolve();

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector('.status-notice')).toBeNull();
    expect(calls).toEqual([['storeControllerNode', 'frame-1', 'modal']]);
  });

  it('shows error feedback in status element on failed controller storage', async () => {
    document[PANEL_BRIDGE_PROPERTY].storeControllerNode = (id, identifier) => {
      calls.push(['storeControllerNode', id, identifier]);
      return Promise.resolve({ success: false, error: 'Controller not found' });
    };
    button.innerHTML = '<span class="badge" data-controller-identifier="modal" data-action="click->panel-node#storeController">modal</span>';
    const badge = button.querySelector('.badge');
    await Promise.resolve();

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const statusElement = document.querySelector('.status-notice');
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain('Controller not found');
  });

  it('shows generic error message when storage fails without specific error', async () => {
    document[PANEL_BRIDGE_PROPERTY].storeControllerNode = (id, identifier) => {
      calls.push(['storeControllerNode', id, identifier]);
      return Promise.resolve({ success: false });
    };
    button.innerHTML = '<span class="badge" data-controller-identifier="modal" data-action="click->panel-node#storeController">modal</span>';
    const badge = button.querySelector('.badge');
    await Promise.resolve();

    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const statusElement = document.querySelector('.status-notice');
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain('Controller storage failed');
  });
});

describe('registerPanelControllers', () => {
  it('exposes the panel bridge to controllers and registers panel controllers', () => {
    const registrations = [];
    const application = {
      register(identifier, controller) {
        registrations.push([identifier, controller]);
      },
    };
    const document = {};
    const panelBridge = {};

    registerPanelControllers(application, panelBridge, document);

    expect(document[PANEL_BRIDGE_PROPERTY]).toBe(panelBridge);
    expect(registrations).toContainEqual(['node', NodeController]);
    expect(registrations).toContainEqual(['panel-node', PanelNodeController]);
    expect(registrations).toContainEqual(['theme', ThemeController]);
  });
});
