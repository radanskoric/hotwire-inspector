import {
  CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
} from "../lib/constants.js";
import { extractControllerOutletDefinitions } from "../lib/controller-outlets.js";
import { extractControllerValueDefinitions } from "../lib/controller-values.js";
import { findController } from "../lib/main_world/controller-lookup.js";

export default defineUnlistedScript(() => {
  const script = document.currentScript;

  if (!script) {
    return;
  }

  onRequest(
    script,
    CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
    CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
    getValueDefinitions,
  );
  onRequest(
    script,
    CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
    CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT,
    getOutletDefinitions,
  );
});

/**
 * Wires a request/response CustomEvent pair on the injected script element:
 * parses the request detail, runs the handler, and answers with the result
 * correlated by requestId. Always answers, even when parsing or the handler
 * throws — otherwise the requesting side would hang and the inspected page
 * would surface the exception as noise.
 *
 * @param {Element} script - the injected script element
 * @param {string} requestEvent
 * @param {string} responseEvent
 * @param {(selector: string | undefined, identifier: string | undefined) => object} handler
 */
function onRequest(script, requestEvent, responseEvent, handler) {
  script.addEventListener(requestEvent, (event) => {
    const customEvent = /** @type {CustomEvent} */ (event);
    let requestId = null;

    try {
      const detail =
        /** @type {{ selector?: string, identifier?: string, requestId?: string }} */ (
          typeof customEvent.detail === "string"
            ? JSON.parse(customEvent.detail)
            : customEvent.detail
        );
      requestId = detail?.requestId ?? null;

      script.dispatchEvent(
        new CustomEvent(responseEvent, {
          detail: JSON.stringify({
            requestId,
            ...handler(detail?.selector, detail?.identifier),
          }),
        }),
      );
    } catch (error) {
      script.dispatchEvent(
        new CustomEvent(responseEvent, {
          detail: JSON.stringify({
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        }),
      );
    }
  });
}

/**
 * @param {string | undefined} selector
 * @param {string | undefined} identifier
 * @returns {import("../lib/types.js").ControllerValueDefinitionsResponse}
 */
function getValueDefinitions(selector, identifier) {
  const result = findController(document, selector, identifier);

  if ("success" in result) {
    return result;
  }

  return {
    success: true,
    definitions: extractControllerValueDefinitions(result.controller),
  };
}

/**
 * @param {string | undefined} selector
 * @param {string | undefined} identifier
 * @returns {import("../lib/types.js").ControllerOutletDefinitionsResponse}
 */
function getOutletDefinitions(selector, identifier) {
  const result = findController(document, selector, identifier);

  if ("success" in result) {
    return result;
  }

  return {
    success: true,
    outlets: extractControllerOutletDefinitions(result.controller),
  };
}
