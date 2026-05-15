// @vitest-environment happy-dom

import { Application } from '@hotwired/stimulus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeController } from '../../lib/panel/controllers/theme-controller.js';

function createStorage() {
  const storedValues = new Map();

  return {
    getItem(key) {
      return storedValues.get(key) ?? null;
    },
    setItem(key, value) {
      storedValues.set(key, value);
    },
    storedValues,
  };
}

async function nextStimulusTick() {
  await Promise.resolve();
}

describe('ThemeController', () => {
  let application;
  let storage;
  let themeSelectElement;

  function startApplication() {
    application = Application.start();
    application.register('theme', ThemeController);
  }

  beforeEach(async () => {
    storage = createStorage();
    vi.stubGlobal('localStorage', storage);
    document.body.innerHTML = `
      <select id="theme-select" data-controller="theme" data-action="change->theme#setTheme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    `;
    themeSelectElement = document.getElementById('theme-select');
    startApplication();

    await nextStimulusTick();
  });

  afterEach(() => {
    application.stop();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });

  it('applies system theme by default without storing an override', () => {
    expect(themeSelectElement.value).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storage.storedValues.size).toBe(0);
  });

  it('applies a persisted dark theme override', async () => {
    storage.storedValues.set('hotwire-inspector.theme', 'dark');

    application.stop();
    startApplication();
    await nextStimulusTick();

    expect(themeSelectElement.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to system for an invalid persisted theme', async () => {
    storage.storedValues.set('hotwire-inspector.theme', 'unknown');
    document.documentElement.dataset.theme = 'dark';

    application.stop();
    startApplication();
    await nextStimulusTick();

    expect(themeSelectElement.value).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('persists and applies theme changes from the switcher', async () => {
    themeSelectElement.value = 'light';
    themeSelectElement.dispatchEvent(new Event('change'));
    await nextStimulusTick();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(storage.storedValues.get('hotwire-inspector.theme')).toBe('light');

    themeSelectElement.value = 'system';
    themeSelectElement.dispatchEvent(new Event('change'));
    await nextStimulusTick();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storage.storedValues.get('hotwire-inspector.theme')).toBe('system');
  });

  it('falls back to system when setting an unknown theme value', () => {
    const controller = application.getControllerForElementAndIdentifier(themeSelectElement, 'theme');

    themeSelectElement.value = 'unknown';
    controller.setTheme();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storage.storedValues.get('hotwire-inspector.theme')).toBe('system');
  });
});
