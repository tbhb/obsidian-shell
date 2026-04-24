#!/usr/bin/env node
// Runs Stryker scoped to src/*.ts files changed vs a base ref.
// Defaults to origin/main; override with STRYKER_BASE. Combines with the
// `incremental: true` setting in stryker.config.json, so unchanged mutants
// inside the changed files still reuse prior results when possible.
import { execFileSync, spawnSync } from 'node:child_process';

const base = process.env['STRYKER_BASE'] ?? 'origin/main';

const diff = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'src/'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.endsWith('.ts'));

if (diff.length === 0) {
  console.log(`No src/*.ts changes vs ${base}; nothing to mutate.`);
  process.exit(0);
}

const result = spawnSync('stryker', ['run', '--mutate', diff.join(',')], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
