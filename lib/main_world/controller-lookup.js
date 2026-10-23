/** @typedef {Window & Record<string, any>} PageWindow */

/** @param {Window | null} window @returns {any} */
export function detectApplication(window) {
  if (!window) return null;
  const pageWindow = /** @type {PageWindow} */ (window);
  for (const name of ["Stimulus", "stimulusApp", "StimulusApp"]) {
    const candidate = pageWindow[name];
    if (
      candidate &&
      typeof candidate.getControllerForElementAndIdentifier === "function"
    )
      return candidate;
  }
  return null;
}

/**
 * Framework access can execute page-owned methods and getters. Look up anew
 * for each request; never cache the application or controller here.
 * @param {Document} document
 * @param {string | undefined} selector
 * @param {string | undefined} identifier
 * @returns {{controller: any} | import("../types.js").MainWorldFailure}
 */
export function findController(document, selector, identifier) {
  if (typeof selector !== "string")
    return { success: false, error: "Element not found" };
  const element = document.querySelector(selector);
  if (!element) return { success: false, error: "Element not found" };
  const application = detectApplication(document.defaultView);
  if (!application)
    return { success: false, error: "Stimulus application not found" };
  const controller = application.getControllerForElementAndIdentifier(
    element,
    identifier ?? "",
  );
  return controller
    ? { controller }
    : { success: false, error: "Controller not found" };
}
