/**
 * Reads the declared Stimulus value definitions off a controller instance.
 *
 * Stimulus blesses every controller prototype with a `valueDescriptorMap`
 * getter: a normalized map of backing attribute name (e.g.
 * `data-modal-title-value`) to a value descriptor carrying the blessed
 * property name (e.g. `titleValue`), the parsed type, and the default.
 * Declared value names are recovered by stripping the conventional `Value`
 * suffix.
 *
 * Non-Stimulus objects (including plain-object test doubles) have no
 * descriptor map and yield an empty list.
 *
 * @param {any} controller - Stimulus controller instance
 * @returns {import("./types.js").ControllerValueDefinition[]}
 */
export function extractControllerValueDefinitions(controller) {
  const descriptorMap = controller?.valueDescriptorMap;

  if (!descriptorMap || typeof descriptorMap !== "object") {
    return [];
  }

  return Object.entries(descriptorMap).map(([attributeName, descriptor]) => {
    const { name, type, defaultValue } =
      /** @type {{ name: string, type?: string, defaultValue?: any }} */ (
        descriptor
      );

    return {
      name: name.replace(/Value$/, ""),
      type: typeof type === "string" ? type : "unknown",
      defaultValue,
      attributeName,
    };
  });
}

/**
 * Resolves the current values of a controller by reading the raw backing
 * attribute strings off its element. Runs in the content script, so value
 * updates can be observed (and re-resolved) without entering the page
 * context again.
 *
 * @param {import("./types.js").ControllerValueDefinition[]} definitions
 * @param {Element} element - element hosting the controller
 * @returns {import("./types.js").ControllerValue[]}
 */
export function resolveControllerValues(definitions, element) {
  return definitions.map(({ name, type, defaultValue, attributeName }) => {
    const value = element.getAttribute(attributeName);

    return {
      name,
      type,
      defaultValue,
      value,
      hasValue: value !== null,
    };
  });
}

/**
 * Formats a Stimulus value for display in the details panel. Objects and
 * arrays serialize as JSON; everything else stringifies.
 *
 * @param {any} value
 * @returns {string}
 */
export function formatControllerValue(value) {
  if (value === null || typeof value === "object") {
    // Defaults originate from JSON-compatible Stimulus value definitions, so
    // this cannot be undefined for objects (and never throws on circular
    // structures).
    return /** @type {string} */ (JSON.stringify(value));
  }

  return String(value);
}
