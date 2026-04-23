import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'test/**', '**/__mocks__/**'],
      // The scaffold ships at 100% across all metrics. Keep it that way —
      // any regression in branches/lines/functions/statements fails CI.
      thresholds: {
        perFile: true,
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./test/__mocks__/obsidian.ts', import.meta.url)),
    },
  },
});
