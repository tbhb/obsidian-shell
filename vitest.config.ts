import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          include: ['test/unit/**/*.test.ts'],
          setupFiles: ['test/unit/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          globals: true,
          environment: 'jsdom',
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['test/integration/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // `src/pty.ts` bundles node-pty and loads a compiled native binary at
      // runtime. `src/view.ts` embeds xterm.js, which needs a real canvas or
      // WebGL renderer. Neither is reachable from jsdom, so Obsidian validates
      // both modules end-to-end instead of Vitest.
      exclude: ['src/**/*.d.ts', 'src/pty.ts', 'src/view.ts', 'test/**', '**/__mocks__/**'],
      // The scaffold ships at 100% across all metrics. Keep it that way.
      // Any regression in branches/lines/functions/statements fails CI.
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
