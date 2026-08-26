/**
 * Builds a fake `runtime.Port`-like object with `postMessage`, `onMessage`,
 * `onDisconnect` listener bags, a `disconnect` spy, and a `_listeners`
 * collection for assertions. Used by background, content-inspector, and
 * panel-bridge unit tests that exercise the content-script / extension port
 * surfaces without a real browser.
 *
 * @typedef {object} FakeExtensionPortOptions
 * @property {string} [name]
 * @property {any} [sender]
 */

import { vi } from "vitest";

/**
 * @param {FakeExtensionPortOptions} [options]
 */
export function createFakeExtensionPort({
  name = undefined,
  sender = null,
} = {}) {
  const listeners = { message: [], disconnect: [] };

  return {
    name,
    sender,
    postMessage: vi.fn(),
    onMessage: { addListener: (cb) => listeners.message.push(cb) },
    onDisconnect: { addListener: (cb) => listeners.disconnect.push(cb) },
    disconnect: vi.fn(),
    _listeners: listeners,
  };
}
