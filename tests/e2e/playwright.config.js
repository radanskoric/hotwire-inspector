import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: '.',
  testIgnore: ['firefox-smoke.spec.js'],
  timeout: 30000,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['firefox-smoke.spec.js'],
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.resolve('output/chrome-mv3')}`,
            `--load-extension=${path.resolve('output/chrome-mv3')}`,
          ],
        },
      },
    },
    {
      name: 'firefox',
      testMatch: ['panel.spec.js'],
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      testIgnore: ['*.spec.js'],
      use: { browserName: 'webkit' },
    },
  ],
});
