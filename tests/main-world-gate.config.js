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
          if (id.endsWith("/entrypoints/main-world.content.js")) {
            // WXT also loads a metadata-only version while discovering entrypoints.
            if (!code.includes("MainWorldRuntime")) return;
            const startup =
              /new MainWorldRuntime\(document, (\[[\s\S]*?\])\)\.start\(\);/;
            if (!startup.test(code)) throw new Error("MAIN startup not found");
            return `import { startGate } from "../tests/e2e/fixtures/main-world-gate/main.js";\n${code.replace(startup, "startGate(document, MainWorldRuntime, $1);")}`;
          }
          if (id.endsWith("/entrypoints/content.js"))
            return `import { startGateClient } from "../tests/e2e/fixtures/main-world-gate/client.js";\n${code.replace("main() {", "main() { startGateClient(document);")}`;
        },
      },
    ],
  }),
});
