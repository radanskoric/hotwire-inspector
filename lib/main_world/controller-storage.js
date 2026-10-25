import { findController } from "./controller-lookup.js";
import { isPlainObject } from "./protocol.js";

/**
 * @param {unknown} value
 * @param {import("../types.js").MainWorldRequest} [request]
 * @returns {import("../types.js").StoreControllerResponse | null}
 */
export function validateStoredController(value, request) {
  if (!isPlainObject(value)) return null;
  const result = /** @type {Record<string, unknown>} */ (value);
  if (
    Object.keys(result).length !== 3 ||
    result.success !== true ||
    typeof result.name !== "string" ||
    !/^temp[1-9][0-9]*$/.test(result.name) ||
    typeof result.identifier !== "string" ||
    (request && result.identifier !== request.identifier)
  )
    return null;
  return { success: true, name: result.name, identifier: result.identifier };
}

/** @param {Document} document @returns {import("../types.js").MainWorldFeature} */
export function createControllerStorage(document) {
  return {
    start() {},
    stop() {},
    operations: {
      storeController: {
        validate: validateStoredController,
        handle({ selector, identifier }) {
          const result = findController(document, selector, identifier);
          if ("success" in result) return result;
          const window =
            /** @type {import("./controller-lookup.js").PageWindow} */ (
              document.defaultView
            );
          for (let index = 1; ; index += 1) {
            const name = `temp${index}`;
            if (name in window) continue;
            window[name] = result.controller;
            console.info(
              "Hotwire Inspector: " +
                (identifier ?? "") +
                " controller stored as " +
                name,
              result.controller,
            );
            return { success: true, name, identifier: identifier ?? "" };
          }
        },
      },
    },
  };
}
