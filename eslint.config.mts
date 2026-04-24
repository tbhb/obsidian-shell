/*
 * ESLint runs two plugins in this scaffold:
 *   - `eslint-plugin-obsidianmd` enforces Obsidian community-plugin submission
 *     rules (sentence case, no innerHTML, no TFile casts, settings-tab
 *     headings, command naming, etc.).
 *   - `eslint-plugin-sonarjs` contributes `sonarjs/cognitive-complexity` so
 *     functions that grow hard to reason about fail lint instead of review.
 *
 * All general-purpose lint + formatting is handled by Biome — see `biome.json`.
 */

import { globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  ...obsidianmd.configs.recommended,
  globalIgnores([
    'node_modules',
    'dist',
    'coverage',
    'main.js',
    'main.js.map',
    'styles.css',
    'vite.config.ts',
    'vitest.config.ts',
    'commitlint.config.js',
    'version-bump.mjs',
    'versions.json',
    'test',
    'e2e',
    '.husky',
  ]),
);
