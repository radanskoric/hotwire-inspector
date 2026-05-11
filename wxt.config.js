import { defineConfig } from 'wxt';

const debugBuild = process.env.WXT_DEBUG_BUILD === 'true';

export default defineConfig({
  outDir: 'output',
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
  },
  webExt: {
    startUrls: ['http://localhost:4173'],
  },
});
