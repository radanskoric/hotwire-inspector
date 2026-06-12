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
      <div class="node expanded" data-controller="node">
        <div class="node-row" data-action="dblclick->node#toggleChildren">
          <span class="node-toggle" data-action="click->node#toggleChildren"></span>
        </div>
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

  it('toggles children state on double-click', async () => {
    const row = node.querySelector('.node-row');

    expect(node.classList.contains('expanded')).toBe(true);

    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(node.classList.contains('expanded')).toBe(false);

    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(node.classList.contains('expanded')).toBe(true);
  });

  it('toggles children visibility and state from the triangle indicator', async () => {
    const toggle = node.querySelector('.node-toggle');

    expect(node.classList.contains('expanded')).toBe(true);

    const event = new Event('click', { bubbles: true, cancelable: true });
    toggle.dispatchEvent(event);
    await Promise.resolve();
    expect(node.classList.contains('expanded')).toBe(false);

    toggle.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(node.classList.contains('expanded')).toBe(true);
  });

  it('no-ops when children target is not present', async () => {
    application.stop();
    document.body.innerHTML = `
      <div data-controller="node">
        <div class="node-row" data-action="dblclick->node#toggleChildren"></div>
      </div>
    `;
    application = Application.start();
    application.register('node', NodeController);
    node = document.querySelector('[data-controller="node"]');
    const row = node.querySelector('.node-row');
    await Promise.resolve();

    // Should not throw
    row.dispatchEvent(new Event('dblclick'));
    await Promise.resolve();
  });
});
