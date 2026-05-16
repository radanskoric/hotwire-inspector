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
