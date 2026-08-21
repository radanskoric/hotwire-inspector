import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReconnectingPort } from "../../lib/port-reconnect.js";

function createFakePort() {
  const listeners = { message: [], disconnect: [] };
  return {
    postMessage: vi.fn(),
    onMessage: { addListener: (cb) => listeners.message.push(cb) },
    onDisconnect: { addListener: (cb) => listeners.disconnect.push(cb) },
    disconnect: vi.fn(),
    _listeners: listeners,
  };
}

function createFakeTimeout() {
  /** @type {Array<{ fn: () => void, delay: number, cleared: boolean }>} */
  const pending = [];

  /** @type {typeof setTimeout} */
  const fakeSetTimeout = (fn, delay) => {
    const entry = { fn, delay, cleared: false };
    pending.push(entry);
    return /** @type {ReturnType<typeof setTimeout>} */ (entry);
  };

  const fakeClearTimeout = (id) => {
    const entry = /** @type {{ cleared: boolean } | null} */ (id);
    if (entry) entry.cleared = true;
  };

  return {
    fakeSetTimeout,
    fakeClearTimeout,
    pending,
    flush() {
      const entries = pending.splice(0).filter((e) => !e.cleared);
      for (const entry of entries) entry.fn();
    },
  };
}

describe("createReconnectingPort", () => {
  /** @type {ReturnType<typeof createFakeTimeout>} */
  let timeout;

  beforeEach(() => {
    timeout = createFakeTimeout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects immediately on creation", () => {
    const port = createFakePort();
    const connectPort = vi.fn(() => port);

    createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    expect(connectPort).toHaveBeenCalledTimes(1);
  });

  it("reconnects after disconnect with initial delay", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );

    createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    firstPort._listeners.disconnect[0]();

    expect(connectPort).toHaveBeenCalledTimes(1);
    expect(timeout.pending).toHaveLength(1);
    expect(timeout.pending[0].delay).toBe(100);

    timeout.flush();

    expect(connectPort).toHaveBeenCalledTimes(2);
  });

  it("doubles delay on each successive disconnect", () => {
    const ports = [createFakePort(), createFakePort(), createFakePort()];
    let callCount = 0;
    const connectPort = vi.fn(() => ports[callCount++]);

    createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    ports[0]._listeners.disconnect[0]();
    expect(timeout.pending[0].delay).toBe(100);

    timeout.flush();
    ports[1]._listeners.disconnect[0]();
    expect(timeout.pending[0].delay).toBe(200);

    timeout.flush();
    ports[2]._listeners.disconnect[0]();
    expect(timeout.pending[0].delay).toBe(400);
  });

  it("caps delay at maxDelay", () => {
    const ports = Array.from({ length: 8 }, () => createFakePort());
    let callCount = 0;
    const connectPort = vi.fn(() => ports[callCount++]);

    createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
      initialDelay: 1000,
      maxDelay: 5000,
    });

    // delays: 1000, 2000, 4000, 5000, 5000, 5000
    for (let i = 0; i < 6; i++) {
      ports[i]._listeners.disconnect[0]();
      timeout.flush();
    }

    ports[6]._listeners.disconnect[0]();
    expect(timeout.pending[0].delay).toBe(5000);
  });

  it("calls onReconnect with the new port after reconnect", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );
    const onReconnect = vi.fn();

    createReconnectingPort({
      connectPort,
      onReconnect,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    expect(onReconnect).not.toHaveBeenCalled();

    firstPort._listeners.disconnect[0]();
    timeout.flush();

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledWith(secondPort);
  });

  it("does not call onReconnect on the first connection", () => {
    const port = createFakePort();
    const onReconnect = vi.fn();

    createReconnectingPort({
      connectPort: () => port,
      onReconnect,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("exposes the current port via the port getter", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    expect(handle.port).toBe(firstPort);

    firstPort._listeners.disconnect[0]();
    expect(handle.port).toBeNull();

    timeout.flush();
    expect(handle.port).toBe(secondPort);
  });

  it("disconnect() tears down the port and stops reconnection", () => {
    const firstPort = createFakePort();
    const connectPort = vi.fn(() => firstPort);

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    firstPort._listeners.disconnect[0]();
    handle.disconnect();

    expect(firstPort.disconnect).toHaveBeenCalled();
    expect(timeout.pending.filter((e) => !e.cleared)).toHaveLength(0);

    timeout.flush();
    expect(connectPort).toHaveBeenCalledTimes(1);
  });

  it("disconnect() clears a pending reconnect timer", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    firstPort._listeners.disconnect[0]();
    expect(timeout.pending).toHaveLength(1);

    handle.disconnect();
    expect(timeout.pending.filter((e) => !e.cleared)).toHaveLength(0);

    timeout.flush();
    expect(connectPort).toHaveBeenCalledTimes(1);
  });

  it("ignores onDisconnect from a stale port after reconnect", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );

    createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    firstPort._listeners.disconnect[0]();
    timeout.flush();

    // firstPort disconnects again (stale event) — should not schedule another reconnect
    firstPort._listeners.disconnect[0]();
    expect(timeout.pending.filter((e) => !e.cleared)).toHaveLength(0);
  });

  it("does not reconnect after disconnect() when a timer fires late", () => {
    const firstPort = createFakePort();
    const connectPort = vi.fn(() => firstPort);

    // Use a no-op clearTimeout so the timer entry survives disconnect()
    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: () => {},
    });

    firstPort._listeners.disconnect[0]();
    handle.disconnect();

    // Fire the timer manually — connect() should bail out
    const entry = timeout.pending.find((e) => !e.cleared);
    if (entry) entry.fn();

    expect(connectPort).toHaveBeenCalledTimes(1);
  });

  it("reconnect immediately disconnects the current port and opens a new one", () => {
    const firstPort = createFakePort();
    const secondPort = createFakePort();
    let callCount = 0;
    const connectPort = vi.fn(() =>
      callCount++ === 0 ? firstPort : secondPort,
    );

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    handle.reconnect();

    expect(firstPort.disconnect).toHaveBeenCalled();
    expect(connectPort).toHaveBeenCalledTimes(2);
    expect(handle.port).toBe(secondPort);
    expect(timeout.pending).toHaveLength(0);
  });

  it("reconnect resets the backoff delay", () => {
    const ports = [createFakePort(), createFakePort(), createFakePort()];
    let callCount = 0;
    const connectPort = vi.fn(() => ports[callCount++]);

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    ports[0]._listeners.disconnect[0]();
    timeout.flush();
    ports[1]._listeners.disconnect[0]();
    expect(timeout.pending[0].delay).toBe(200);

    handle.reconnect();

    expect(handle.port).toBe(ports[2]);
    ports[2]._listeners.disconnect[0]();
    expect(timeout.pending.find((e) => !e.cleared)?.delay).toBe(100);
  });

  it("does not schedule reconnect when disconnect() is called before onDisconnect", () => {
    const firstPort = createFakePort();
    const connectPort = vi.fn(() => firstPort);

    const handle = createReconnectingPort({
      connectPort,
      setTimeoutImpl: timeout.fakeSetTimeout,
      clearTimeoutImpl: timeout.fakeClearTimeout,
    });

    // Disconnect first, then fire the port's onDisconnect
    handle.disconnect();
    firstPort._listeners.disconnect[0]();

    expect(timeout.pending.filter((e) => !e.cleared)).toHaveLength(0);
  });
});
