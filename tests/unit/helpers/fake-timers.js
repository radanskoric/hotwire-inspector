import { vi } from "vitest";

/**
 * Runs `fn` with `vi.useFakeTimers()` enabled and restores real timers
 * afterward, even when `fn` throws. Returns whatever `fn` returns so tests
 * can assert on the result.
 *
 * @template T
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withFakeTimers(fn) {
  vi.useFakeTimers();
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}
