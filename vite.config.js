import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**/*.js'],
      exclude: [
        'tests/**',
        '**/output/**',
        '**/.wxt/**',
        'node_modules/**',
        '**/vite.config.js',
        '**/wxt.config.js',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
