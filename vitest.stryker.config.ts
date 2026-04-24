import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Stryker-only Vitest config. Scopes test execution to the unit project so
// mutation runs don't drag in the on-disk vault fixture used by integration
// tests or the fast-check iteration count from property tests. Keep the
// obsidian alias in sync with the primary Vitest config.
const obsidianMockPath = fileURLToPath(new URL('./test/__mocks__/obsidian.ts', import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/unit/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      obsidian: obsidianMockPath,
    },
  },
});
