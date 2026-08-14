import {
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
} from "../lib/constants.js";

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

  script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
    const customEvent = /** @type {CustomEvent} */ (event);
    const detail =
      /** @type {import("../lib/types.js").StoreControllerRequestDetail} */ (
        typeof customEvent.detail === "string"
          ? JSON.parse(customEvent.detail)
          : customEvent.detail
      );
    const { selector, identifier, requestId } = detail ?? {};
    const response = storeController(
      /** @type {string} */ (selector),
      /** @type {string} */ (identifier),
    );

    script.dispatchEvent(
      new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
        detail: JSON.stringify(
          /** @type {import("../lib/types.js").StoreControllerResponseDetail} */ ({
            requestId,
            ...response,
          }),
        ),
      }),
    );
  });
});

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
 * @param {string} selector
 * @param {string} identifier
 * @returns {import("../lib/types.js").StoreControllerResponse}
 */
function storeController(selector, identifier) {
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

  for (let index = 1; ; index += 1) {
    const name = `temp${index}`;

    if (!(name in window)) {
      /** @type {PageWindow} */ (window)[name] = controller;
      console.info(
        "Hotwire Inspector: " + identifier + " controller stored as " + name,
        controller,
      );
      return { success: true, name, identifier };
    }
  }
}
