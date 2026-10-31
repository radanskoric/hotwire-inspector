import { MAIN_WORLD_TURBO_EVENT_NAME } from "../constants.js";
import {
  TurboEventWatcher,
  MAIN_WORLD_TURBO_EVENT_NAMES,
} from "../turbo-event-watcher.js";

/** @param {Document} document @returns {import("../types.js").MainWorldFeature} */
export function captureTurboEvents(document) {
  const watcher = new TurboEventWatcher({
    document,
    eventNames: MAIN_WORLD_TURBO_EVENT_NAMES,
    onEvent(payload, sourceEvent) {
      const target = sourceEvent.target;
      const destination =
        target instanceof Element &&
        target.ownerDocument === document &&
        target.isConnected
          ? target
          : document;
      destination.dispatchEvent(
        new CustomEvent(MAIN_WORLD_TURBO_EVENT_NAME, {
          bubbles: true,
          detail: JSON.stringify(payload),
        }),
      );
    },
  });
  return {
    operations: {},
    start: () => watcher.start(),
    stop: () => watcher.stop(),
  };
}
