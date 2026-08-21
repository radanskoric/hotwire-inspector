/**
 * @typedef {import("./types.js").PortLike} PortLike
 */

/**
 * @typedef {object} ReconnectingPortOptions
 * @property {() => PortLike} connectPort
 * @property {(port: PortLike) => void} [onReconnect]
 * @property {number} [initialDelay]
 * @property {number} [maxDelay]
 * @property {typeof setTimeout} [setTimeoutImpl]
 * @property {typeof clearTimeout} [clearTimeoutImpl]
 */

/**
 * @typedef {object} ReconnectingPort
 * @property {PortLike | null} port
 * @property {() => void} disconnect
 */

/**
 * Creates a port that reconnects with exponential backoff on disconnect.
 *
 * @param {ReconnectingPortOptions} options
 * @returns {ReconnectingPort}
 */
export function createReconnectingPort({
  connectPort,
  onReconnect,
  initialDelay = 100,
  maxDelay = 5000,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  /** @type {PortLike | null} */
  let currentPort = null;
  /** @type {PortLike | null} */
  let lastConnectedPort = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let reconnectTimer = null;
  let currentDelay = initialDelay;
  let isFirstConnect = true;
  let isDisconnected = false;

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeoutImpl(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connect() {
    if (isDisconnected) {
      return;
    }

    const port = connectPort();
    currentPort = port;
    lastConnectedPort = port;

    port.onDisconnect.addListener(() => {
      if (currentPort === port) {
        currentPort = null;
        scheduleReconnect();
      }
    });

    if (isFirstConnect) {
      isFirstConnect = false;
    } else {
      onReconnect?.(port);
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    reconnectTimer = setTimeoutImpl(connect, currentDelay);
    currentDelay = Math.min(currentDelay * 2, maxDelay);
  }

  connect();

  return {
    get port() {
      return currentPort;
    },
    disconnect() {
      isDisconnected = true;
      clearReconnectTimer();
      lastConnectedPort?.disconnect();
      currentPort = null;
      lastConnectedPort = null;
    },
  };
}
