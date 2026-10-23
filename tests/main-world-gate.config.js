import { defineConfig } from "wxt";
import base from "../wxt.config.js";

// Test-only build: the shipped configuration never imports this instrumentation.
export default defineConfig({
  ...base,
  outDir: "output/main-world-gate",
  vite: () => ({
    plugins: [
      {
        name: "main-world-browser-gate",
        enforce: "pre",
        transform(code, id) {
          if (id.startsWith("\0")) return;
          if (id.endsWith("/lib/constants.js"))
            return code.replace(
              "export const MAIN_WORLD_OPERATIONS = [",
              'export const MAIN_WORLD_OPERATIONS = ["fixtureRead",',
            );
          if (id.endsWith("/entrypoints/main-world.content.js"))
            return `import { startGate } from "../tests/e2e/fixtures/main-world-gate/main.js";\n${code.replace("new MainWorldRuntime(document, [createControllerStorage]).start();", "startGate(document, MainWorldRuntime, [createControllerStorage]);")}`;
          if (id.endsWith("/entrypoints/content.js"))
            return `import { startGateClient } from "../tests/e2e/fixtures/main-world-gate/client.js";\n${code.replace("main() {", "main() { startGateClient(document);")}`;
        },
      },
    ],
  }),
});
