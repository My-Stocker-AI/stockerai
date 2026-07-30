import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // playwright-tests/**: the browser-fixture logic that decides what a test route contains.
    // It is pure and belongs under unit test even though it serves the browser suite.
    include: ['src/**/*.test.ts', 'playwright-tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
