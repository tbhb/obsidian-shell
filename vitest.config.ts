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
      // src/pty.ts loads node-pty via Electron's window.require against a
      // compiled native binary. src/view.ts embeds xterm.js, which needs a
      // real canvas/WebGL renderer. Neither is reachable from jsdom, so
      // both modules are validated end-to-end inside Obsidian, not in
      // vitest.
      exclude: ['src/**/*.d.ts', 'src/pty.ts', 'src/view.ts', 'test/**', '**/__mocks__/**'],
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
