import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['firefox-smoke.spec.js'],
  timeout: 30000,
  workers: 1,
  use: {
    browserName: 'firefox',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});
