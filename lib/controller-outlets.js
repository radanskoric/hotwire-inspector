/**
 * Reads the declared Stimulus outlet names off a controller instance.
 *
 * Stimulus blesses every controller prototype with a `outlets` static array
 * (e.g. `static outlets = ["user-status"]`). This returns the names
 * defensively; missing or non-array data yields an empty list.
 *
 * @param {any} controller - Stimulus controller instance
 * @returns {string[]}
 */
export function extractControllerOutletDefinitions(controller) {
  const outlets = controller?.constructor?.outlets;

  if (!Array.isArray(outlets)) {
    return [];
  }

  return outlets.filter((outlet) => typeof outlet === "string");
}
