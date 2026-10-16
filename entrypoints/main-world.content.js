import { MainWorldRuntime } from "../lib/main_world/runtime.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  world: "MAIN",
  runAt: "document_start",
  globalName: false,
  main() {
    new MainWorldRuntime(document, []).start();
  },
});
