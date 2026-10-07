import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      include: ['src/**'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        statements: 84,
        branches: 67,
        functions: 86,
        lines: 89,
      },
    },
  },
});
