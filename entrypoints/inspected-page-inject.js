import {
  CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
} from "../lib/constants.js";
import { extractControllerValueDefinitions } from "../lib/controller-values.js";

/**
 * The inspected page's window. Hotwire apps may expose their Stimulus
 * application under one of several global names, and stored controllers are
 * exposed as `temp<N>` globals, so arbitrary property access is intentional
 * here.
 *
 * @typedef {Window & typeof globalThis & Record<string, any>} PageWindow
 */

export default defineUnlistedScript(() => {
  const script = document.currentScript;

  if (!script) {
    return;
  }

  onRequest(
    script,
    STORE_CONTROLLER_REQUEST_EVENT,
    STORE_CONTROLLER_RESPONSE_EVENT,
    storeController,
  );
  onRequest(
    script,
    CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
    CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
    getValueDefinitions,
  );
});

/**
 * Wires a request/response CustomEvent pair on the injected script element:
 * parses the request detail, runs the handler, and answers with the result
 * correlated by requestId.
 *
 * @param {Element} script - the injected script element
 * @param {string} requestEvent
 * @param {string} responseEvent
 * @param {(selector: string, identifier: string) => object} handler
 */
function onRequest(script, requestEvent, responseEvent, handler) {
  script.addEventListener(requestEvent, (event) => {
    const customEvent = /** @type {CustomEvent} */ (event);
    const detail =
      /** @type {{ selector: string, identifier: string, requestId: string }} */ (
        typeof customEvent.detail === "string"
          ? JSON.parse(customEvent.detail)
          : customEvent.detail
      );
    const { selector, identifier, requestId } = detail ?? {};

    script.dispatchEvent(
      new CustomEvent(responseEvent, {
        detail: JSON.stringify({ requestId, ...handler(selector, identifier) }),
      }),
    );
  });
}

/**
 * @param {any} candidate - potential Stimulus application global
 * @returns {boolean}
 */
function checkApplicationCandidate(candidate) {
  return (
    candidate &&
    typeof candidate.getControllerForElementAndIdentifier === "function"
  );
}

function detectApplication() {
  const pageWindow = /** @type {PageWindow} */ (window);

  if (checkApplicationCandidate(pageWindow.Stimulus)) {
    return pageWindow.Stimulus;
  }
  if (checkApplicationCandidate(pageWindow.stimulusApp)) {
    return pageWindow.stimulusApp;
  }
  if (checkApplicationCandidate(pageWindow.StimulusApp)) {
    return pageWindow.StimulusApp;
  }
  return null;
}

/**
 * Finds the Stimulus controller instance for the given selector and
 * identifier, or answers with an error response.
 *
 * @param {string} selector
 * @param {string} identifier
 * @returns {{ controller: any } | { success: false, error: string }}
 */
function findController(selector, identifier) {
  const element = document.querySelector(selector);

  if (!element) {
    return { success: false, error: "Element not found" };
  }

  const application = detectApplication();
  if (!application) {
    return { success: false, error: "Stimulus application not found" };
  }

  const controller = application.getControllerForElementAndIdentifier(
    element,
    identifier,
  );

  if (!controller) {
    return { success: false, error: "Controller not found" };
  }

  return { controller };
}

/**
 * @param {string} selector
 * @param {string} identifier
 * @returns {import("../lib/types.js").StoreControllerResponse}
 */
function storeController(selector, identifier) {
  const result = findController(selector, identifier);

  if ("success" in result) {
    return result;
  }

  for (let index = 1; ; index += 1) {
    const name = `temp${index}`;

    if (!(name in window)) {
      /** @type {PageWindow} */ (window)[name] = result.controller;
      console.info(
        "Hotwire Inspector: " + identifier + " controller stored as " + name,
        result.controller,
      );
      return { success: true, name, identifier };
    }
  }
}

/**
 * @param {string} selector
 * @param {string} identifier
 * @returns {import("../lib/types.js").ControllerValueDefinitionsResponse}
 */
function getValueDefinitions(selector, identifier) {
  const result = findController(selector, identifier);

  if ("success" in result) {
    return result;
  }

  return {
    success: true,
    definitions: extractControllerValueDefinitions(result.controller),
  };
}
