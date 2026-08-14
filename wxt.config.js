import { defineConfig } from "wxt";

const debugBuild = process.env.WXT_DEBUG_BUILD === "true";
const devServerPort = Number(process.env.WXT_DEV_SERVER_PORT || 4173);

export default defineConfig({
  outDir: "output",
  dev: {
    server: {
      port: devServerPort,
    },
  },
  vite: () => ({
    build: {
      minify: debugBuild ? false : undefined,
      sourcemap: debugBuild,
    },
  }),
  manifest: {
    name: "Hotwire Inspector",
    browser_specific_settings: {
      gecko: {
        id: "hotwire-inspector@radan.dev",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    permissions: ["activeTab", "scripting", "tabs"],
    devtools_page: "devtools.html",
    web_accessible_resources: [
      {
        resources: ["inspected-page-inject.js"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
  },
  webExt: {
    startUrls: ["http://localhost:3000"],
  },
});
