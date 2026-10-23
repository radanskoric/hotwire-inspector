import { MainWorldRuntime } from "../lib/main_world/runtime.js";
import { createControllerStorage } from "../lib/main_world/controller-storage.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  world: "MAIN",
  runAt: "document_start",
  globalName: false,
  main() {
    new MainWorldRuntime(document, [createControllerStorage]).start();
  },
});
