// @vitest-environment happy-dom

import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusController } from '../../lib/panel/controllers/status-controller.js';

describe('StatusController', () => {
  let application;
  let statusElement;
  let statusController;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="status" data-controller="status">
        <span data-status-target="text">Test message</span>
      </div>
    `;
    application = Application.start();
    application.register('status', StatusController);
    statusElement = document.getElementById('status');
    await Promise.resolve();
    statusController = application.getControllerForElementAndIdentifier(statusElement, 'status');
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('schedules removal on connect', () => {
    expect(statusController.hideTimeout).toBeDefined();
  });

  it('removes the status element after the configured duration', async () => {
    application.stop();
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="status" data-controller="status" data-status-duration-value="100">
        <span data-status-target="text">Test message</span>
      </div>
    `;
    application = Application.start();
    application.register('status', StatusController);
    statusElement = document.getElementById('status');
    await Promise.resolve();

    vi.advanceTimersByTime(100);

    expect(document.getElementById('status')).toBeNull();
  });

  it('uses custom duration when specified', () => {
    statusController.disconnect();
    statusController.durationValue = 5000;

    statusController.connect();

    expect(statusController.hideTimeout).toBeDefined();
  });

  it('clears an existing timeout before reconnecting', () => {
    const timeoutBefore = statusController.hideTimeout;

    statusController.connect();

    expect(timeoutBefore._destroyed).toBe(true);
    expect(statusController.hideTimeout).toBeDefined();
    expect(statusController.hideTimeout).not.toBe(timeoutBefore);
  });

  it('clears timeout on disconnect', () => {
    const timeoutBefore = statusController.hideTimeout;

    statusController.disconnect();

    expect(statusController.hideTimeout).toBeNull();
    expect(timeoutBefore._destroyed).toBe(true);
  });

  it('ignores disconnect when no timeout is set', () => {
    statusController.hideTimeout = null;

    statusController.disconnect();

    expect(statusController.hideTimeout).toBeNull();
  });
});
