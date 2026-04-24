/*
 * ESLint runs three plugins in this scaffold:
 *   - `typescript-eslint` supplies type-aware rules that Biome doesn't
 *     cover (no-unsafe-*, strict-boolean-expressions, restrict-plus-operands,
 *     restrict-template-expressions, etc.).
 *   - `eslint-plugin-obsidianmd` enforces Obsidian community-plugin submission
 *     rules (sentence case, no innerHTML, no TFile casts, settings-tab
 *     headings, command naming, etc.).
 *   - `eslint-plugin-sonarjs` contributes `sonarjs/cognitive-complexity` so
 *     functions that grow hard to reason about fail lint instead of review.
 *
 * Biome owns general-purpose lint + formatting + the type-aware rules it
 * already covers (no-floating-promises, no-misused-promises, no-explicit-any,
 * no-non-null-assertion, no-ts-ignore). See `biome.json`.
 */

import { globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typeAwareRules = {
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'error',
  '@typescript-eslint/ban-ts-comment': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-confusing-void-expression': 'error',
  '@typescript-eslint/restrict-plus-operands': 'error',
  '@typescript-eslint/restrict-template-expressions': 'error',
  '@typescript-eslint/require-await': 'error',
  // Biome owns no-explicit-any (see biome.json). Disable the ESLint variant
  // to keep a single source of truth.
  '@typescript-eslint/no-explicit-any': 'off',
} as const;

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
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
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      sonarjs,
    },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      ...typeAwareRules,
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      sonarjs,
    },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      ...typeAwareRules,
    },
  },
  // Mirror Biome's test-mock carve-out: the mock intentionally uses looser
  // patterns to mirror Obsidian's runtime API without pulling in the full
  // type surface.
  {
    files: ['test/__mocks__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // Scope the Obsidian submission rules to plugin source only; they fire
  // false positives on test fixtures that intentionally probe forbidden
  // patterns. The plugin's recommended preset doubles as a plain rules map,
  // so apply it directly instead of spreading the multi-layer flat-config
  // array the plugin also exposes.
  {
    files: ['src/**/*.ts'],
    plugins: { obsidianmd },
    rules: { ...obsidianmd.configs.recommended },
  },
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
    '.husky',
  ]),
);
