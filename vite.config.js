import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    globals: true,
  },
});
