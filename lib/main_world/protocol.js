import { MAIN_WORLD_OPERATIONS } from "../constants.js";

/** @param {unknown} value @returns {value is Record<string, any>} */
function plain(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function only(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** @param {unknown} value @param {number} limit @returns {value is string} */
function text(value, limit) {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}

/** @param {unknown} raw @param {number} limit @returns {Record<string, any> | null} */
function parse(raw, limit) {
  if (typeof raw !== "string" || raw.length > limit) return null;
  try {
    const value = JSON.parse(raw);
    return plain(value) ? value : null;
  } catch {
    return null;
  }
}

/** @param {Record<string, any>} value */
function envelope(value) {
  return (
    value.version === 1 &&
    text(value.requestId, 128) &&
    MAIN_WORLD_OPERATIONS.includes(value.operation)
  );
}

/** @param {unknown} raw @returns {import("../types.js").MainWorldRequest | null} */
export function parseRequest(raw) {
  const value = parse(raw, 128 * 1024);
  if (
    !value ||
    !envelope(value) ||
    !only(value, [
      "version",
      "requestId",
      "operation",
      "selector",
      "identifier",
    ])
  )
    return null;
  const base = {
    version: /** @type {const} */ (1),
    requestId: value.requestId,
    operation: value.operation,
  };
  if (value.operation === "bridgeStatus") {
    return only(value, ["version", "requestId", "operation"]) ? base : null;
  }
  if (!text(value.selector, 16384) || !text(value.identifier, 1024))
    return null;
  return { ...base, selector: value.selector, identifier: value.identifier };
}

/** @param {unknown} value @returns {import("../types.js").MainWorldStatus | null} */
export function validateStatus(value) {
  if (
    !plain(value) ||
    !only(value, ["success", "operations"]) ||
    value.success !== true ||
    !Array.isArray(value.operations) ||
    !value.operations.every(
      (name) =>
        typeof name === "string" && MAIN_WORLD_OPERATIONS.includes(name),
    )
  )
    return null;
  return { success: true, operations: [...value.operations] };
}

/** @param {unknown} error @returns {import("../types.js").MainWorldFailure} */
export function failure(error) {
  let message = "MAIN-world operation failed";
  try {
    if (error instanceof Error && typeof error.message === "string") {
      message = error.message.slice(0, 4096);
    }
  } catch {
    // Page-owned errors can have throwing accessors.
  }
  return { success: false, error: message };
}

/**
 * Validators return reconstructed data, never the supplied page object.
 * @param {unknown} value
 * @param {import("../types.js").MainWorldResultValidator | undefined} validator
 * @returns {object | null}
 */
export function validateResult(value, validator) {
  if (!plain(value)) return null;
  if (value.success === false) {
    return only(value, ["success", "error"]) &&
      typeof value.error === "string" &&
      value.error.length <= 4096
      ? { success: false, error: value.error }
      : null;
  }
  return validator ? validator(value) : null;
}

/**
 * @param {unknown} raw
 * @param {Record<string, import("../types.js").MainWorldResultValidator>} validators
 * @returns {import("../types.js").MainWorldResponse | null}
 */
export function parseResponse(raw, validators) {
  const value = parse(raw, 1024 * 1024);
  if (
    !value ||
    !envelope(value) ||
    !only(value, ["version", "requestId", "operation", "result"])
  )
    return null;
  try {
    const result = validateResult(
      value.result,
      value.operation === "bridgeStatus"
        ? validateStatus
        : validators[value.operation],
    );
    return result
      ? {
          version: 1,
          requestId: value.requestId,
          operation: value.operation,
          result,
        }
      : null;
  } catch {
    return null;
  }
}
