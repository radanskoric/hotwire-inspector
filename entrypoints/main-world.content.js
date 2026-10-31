import { MainWorldRuntime } from "../lib/main_world/runtime.js";
import { createControllerStorage } from "../lib/main_world/controller-storage.js";
import { createControllerDefinitions } from "../lib/main_world/controller-definitions.js";
import { captureTurboEvents } from "../lib/main_world/capture-turbo-events.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  world: "MAIN",
  runAt: "document_start",
  globalName: false,
  main() {
    new MainWorldRuntime(document, [
      createControllerStorage,
      createControllerDefinitions,
      captureTurboEvents,
    ]).start();
  },
});
