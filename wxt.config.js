import { defineConfig } from 'wxt';

const debugBuild = process.env.WXT_DEBUG_BUILD === 'true';
const devServerPort = Number(process.env.WXT_DEV_SERVER_PORT || 3000);

export default defineConfig({
  outDir: 'output',
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
    name: 'Hotwire Inspector',
    permissions: ['activeTab', 'scripting', 'tabs'],
    devtools_page: 'devtools.html',
    web_accessible_resources: [{
      resources: ['inspected-page-inject.js'],
      matches: ['http://*/*', 'https://*/*'],
    }],
  },
  webExt: {
    startUrls: ['http://localhost:4173'],
  },
});
