import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Hotwire Inspector',
    permissions: ['activeTab', 'scripting'],
    devtools_page: 'devtools.html',
  },
  runner: {
    startUrls: ['http://localhost:4173'],
  },
});
