/*
 * ESLint exists in this scaffold ONLY to run `eslint-plugin-obsidianmd`, which
 * enforces Obsidian community-plugin submission rules (sentence case, no
 * innerHTML, no TFile casts, settings-tab headings, command naming, etc.).
 *
 * All general-purpose lint + formatting is handled by Biome — see `biome.json`.
 */

import { globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
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
    '.husky',
  ]),
);
