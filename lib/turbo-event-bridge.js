import { isPlainObject } from "./main_world/protocol.js";
import {
  MAIN_WORLD_TURBO_EVENT_NAMES,
  FRAME_HTML_LIMIT,
} from "./turbo-event-watcher.js";

/** @type {Record<string, number>} */
const DETAIL_LIMITS = {
  newFrameSrc: 8192,
  newFrameId: 8192,
  html: FRAME_HTML_LIMIT,
  htmlError: 256,
  detailsError: 256,
};

/** Shape validation is not authentication: page scripts can forge valid records.
 * @param {unknown} raw
 * @returns {import("./types.js").MainWorldTurboEventDetail | null}
 */
export function parseMainWorldTurboEvent(raw) {
  if (typeof raw !== "string" || raw.length > 524288) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 3 ||
    !Object.keys(value).every((key) =>
      ["name", "timestamp", "details"].includes(key),
    ) ||
    !MAIN_WORLD_TURBO_EVENT_NAMES.includes(value.name) ||
    !Number.isFinite(value.timestamp) ||
    value.timestamp < 1000000000000 ||
    value.timestamp > 9999999999999 ||
    !isPlainObject(value.details)
  )
    return null;
  if (
    Object.hasOwn(value.details, "html") &&
    Object.hasOwn(value.details, "htmlError")
  )
    return null;
  /** @type {Record<string, string>} */
  const details = {};
  for (const [key, item] of Object.entries(value.details)) {
    if (
      !Object.hasOwn(DETAIL_LIMITS, key) ||
      typeof item !== "string" ||
      item.length > /** @type {number} */ (DETAIL_LIMITS[key])
    )
      return null;
    details[key] = item;
  }
  return { name: value.name, timestamp: value.timestamp, details };
}
