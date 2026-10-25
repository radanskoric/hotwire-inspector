import { extractControllerValueDefinitions } from "../controller-values.js";
import { extractControllerOutletDefinitions } from "../controller-outlets.js";
import { findController } from "./controller-lookup.js";
import { isPlainObject } from "./protocol.js";

/**
 * Reconstruct JSON defaults before serialization can drop or coerce values.
 * Undefined is the invalid-value sentinel, never a supported default.
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
function copyDefault(value, depth = 0) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (depth >= 32) return undefined;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1) return undefined;
    const copy = [];
    for (const item of value) {
      const child = copyDefault(item, depth + 1);
      if (child === undefined) return undefined;
      copy.push(child);
    }
    return copy;
  }
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (Reflect.ownKeys(value).length !== keys.length) return undefined;
  const copy = /** @type {Record<string, any>} */ ({});
  for (const key of keys) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      return undefined;
    const child = copyDefault(value[key], depth + 1);
    if (child === undefined) return undefined;
    copy[key] = child;
  }
  return copy;
}

/** @param {unknown} value @returns {import("../types.js").ControllerValueDefinitionsResponse | null} */
export function validateValueDefinitions(value) {
  if (
    !isPlainObject(value) ||
    value.success !== true ||
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.definitions) ||
    value.definitions.length > 1024
  )
    return null;
  const definitions = [];
  for (const entry of value.definitions) {
    if (
      !isPlainObject(entry) ||
      Object.keys(entry).length !== 4 ||
      ![entry.name, entry.type, entry.attributeName].every(
        (text) => typeof text === "string" && text.length <= 16384,
      )
    )
      return null;
    const defaultValue = copyDefault(entry.defaultValue);
    if (defaultValue === undefined) return null;
    definitions.push({
      name: entry.name,
      type: entry.type,
      attributeName: entry.attributeName,
      defaultValue,
    });
  }
  return { success: true, definitions };
}

/** @param {unknown} value @returns {import("../types.js").ControllerOutletDefinitionsResponse | null} */
export function validateOutletDefinitions(value) {
  if (
    !isPlainObject(value) ||
    value.success !== true ||
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.outlets) ||
    value.outlets.length > 1024
  )
    return null;
  const outlets = [...value.outlets];
  if (!outlets.every((name) => typeof name === "string" && name.length <= 1024))
    return null;
  return { success: true, outlets };
}

/** @param {Document} document @returns {import("../types.js").MainWorldFeature} */
export function createControllerDefinitions(document) {
  return {
    start() {},
    stop() {},
    operations: {
      controllerValueDefinitions: {
        validate: validateValueDefinitions,
        handle({ selector, identifier }) {
          const result = findController(document, selector, identifier);
          if ("success" in result) return result;
          return {
            success: true,
            definitions: extractControllerValueDefinitions(result.controller),
          };
        },
      },
      controllerOutletDefinitions: {
        validate: validateOutletDefinitions,
        handle({ selector, identifier }) {
          const result = findController(document, selector, identifier);
          if ("success" in result) return result;
          return {
            success: true,
            outlets: extractControllerOutletDefinitions(result.controller),
          };
        },
      },
    },
  };
}
