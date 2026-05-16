// @vitest-environment happy-dom

import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeController } from '../../lib/panel/controllers/node-controller.js';

describe('NodeController', () => {
  let application;
  let node;
  let children;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="node">
        <div class="node-row" data-action="dblclick->node#toggleChildren"></div>
        <div class="node-children" data-node-target="children"></div>
      </div>
    `;
    application = Application.start();
    application.register('node', NodeController);
    node = document.querySelector('[data-controller="node"]');
    children = document.querySelector('[data-node-target="children"]');

    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = '';
  });

  it('toggles children visibility on double-click', async () => {
    const row = node.querySelector('.node-row');
    
    // Initial state: children are visible (hidden=false by default in HTML)
    expect(children.hidden).toBe(false);
    
    // First double-click: hide children
    row.dispatchEvent(new Event('dblclick'));
    await Promise.resolve();
    expect(children.hidden).toBe(true);
    
    // Second double-click: show children again
    row.dispatchEvent(new Event('dblclick'));
    await Promise.resolve();
    expect(children.hidden).toBe(false);
  });

  it('no-ops when children target is not present', async () => {
    document.body.innerHTML = `
      <div data-controller="node">
        <div class="node-row" data-action="dblclick->node#toggleChildren"></div>
      </div>
    `;
    application = Application.start();
    application.register('node', NodeController);
    node = document.querySelector('[data-controller="node"]');
    const row = node.querySelector('.node-row');
    
    // Should not throw
    row.dispatchEvent(new Event('dblclick'));
    await Promise.resolve();
  });
});
