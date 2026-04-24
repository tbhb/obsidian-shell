import { execSync } from 'node:child_process';

// Runtime globals injected by Danger. Declared locally because the package
// types are module-scoped and can't resolve as ambient globals.
interface DangerCommit {
  readonly sha: string;
  readonly message: string;
  readonly author?: { name?: string; email?: string };
}

interface DangerTextDiff {
  readonly added: string;
  readonly removed: string;
}

interface DangerContext {
  readonly git: {
    readonly created_files: readonly string[];
    readonly modified_files: readonly string[];
    readonly deleted_files: readonly string[];
    readonly commits: readonly DangerCommit[];
    readonly diffForFile: (path: string) => Promise<DangerTextDiff | null>;
    readonly base?: string;
  };
  readonly github?: {
    readonly pr?: {
      readonly user?: { readonly login?: string };
      readonly base?: { readonly sha?: string };
    };
  };
}

declare const danger: DangerContext;
declare function fail(message: string): void;
declare function warn(message: string): void;
declare function schedule(task: Promise<void>): void;

export const HARD_SIZE_CAP_LOC = 800;
export const SOFT_SIZE_WARN_LOC = 300;
export const CHRISTMAS_TREE_FILE_COUNT = 8;
export const DIRECTORY_SPREAD_LIMIT = 4;
export const MIN_ASSERTIONS_PER_TEST = 2;
export const PURE_ADDITION_ADDS_THRESHOLD = 200;

const SIZE_IGNORE_PATTERNS: readonly RegExp[] = [
  /^pnpm-lock\.yaml$/,
  /\.snap$/,
  /^versions\.json$/,
  /^manifest\.json$/,
  /^CHANGELOG\.md$/,
  /^main\.js$/,
  /^main\.js\.map$/,
  /^styles\.css$/,
  /^styles\.css\.map$/,
  /^dist\//,
  /^coverage\//,
  /^reports\//,
];

const RELEASE_MANAGED_FILES: readonly string[] = ['manifest.json', 'versions.json', 'CHANGELOG.md'];

const BUILD_OUTPUT_FILES: readonly string[] = [
  'main.js',
  'main.js.map',
  'styles.css',
  'styles.css.map',
];

function resolveBase(): string {
  const githubBase = process.env['GITHUB_BASE_REF'];
  if (githubBase !== undefined && githubBase.length > 0) {
    return `origin/${githubBase}`;
  }
  const dangerBase = danger.git.base;
  if (dangerBase !== undefined && dangerBase.length > 0) {
    return dangerBase;
  }
  const envBase = process.env['DANGER_BASE'];
  if (envBase !== undefined && envBase.length > 0) {
    return envBase;
  }
  return 'origin/main';
}

function shouldIgnoreForSize(path: string): boolean {
  return SIZE_IGNORE_PATTERNS.some((pattern) => pattern.test(path));
}

function runGit(args: readonly string[]): string {
  return execSync(['git', ...args].join(' '), { encoding: 'utf8' });
}

interface NumstatRow {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

function parseNumstat(base: string): NumstatRow[] {
  const output = runGit([
    'diff',
    '-M',
    '-C',
    '--numstat',
    '--ignore-all-space',
    '--ignore-blank-lines',
    `${base}...HEAD`,
  ]);
  const rows: NumstatRow[] = [];
  for (const line of output.split('\n')) {
    if (line.length === 0) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [addedRaw, removedRaw, path] = parts;
    if (path === undefined) continue;
    const added = addedRaw === '-' ? 0 : Number.parseInt(addedRaw ?? '0', 10);
    const removed = removedRaw === '-' ? 0 : Number.parseInt(removedRaw ?? '0', 10);
    if (Number.isNaN(added) || Number.isNaN(removed)) continue;
    rows.push({ path, added, removed });
  }
  return rows;
}

function allChangedFiles(): readonly string[] {
  return [...danger.git.created_files, ...danger.git.modified_files, ...danger.git.deleted_files];
}

function topFilesByLOC(rows: readonly NumstatRow[], limit: number): NumstatRow[] {
  return [...rows]
    .filter((row) => !shouldIgnoreForSize(row.path))
    .sort((a, b) => b.added + b.removed - (a.added + a.removed))
    .slice(0, limit);
}

function checkSize(rows: readonly NumstatRow[]): void {
  const counted = rows.filter((row) => !shouldIgnoreForSize(row.path));
  const total = counted.reduce((sum, row) => sum + row.added + row.removed, 0);
  if (total > HARD_SIZE_CAP_LOC) {
    fail(
      `Diff is ${total} semantic LOC, above the hard cap of ${HARD_SIZE_CAP_LOC}. Split this PR.`,
    );
    return;
  }
  if (total > SOFT_SIZE_WARN_LOC) {
    const top = topFilesByLOC(counted, 5)
      .map((row) => `- \`${row.path}\` (+${row.added}/-${row.removed})`)
      .join('\n');
    warn(
      `Diff is ${total} semantic LOC, above the soft warn of ${SOFT_SIZE_WARN_LOC}. Largest files:\n${top}`,
    );
  }
}

function checkChristmasTree(rows: readonly NumstatRow[]): void {
  const small = rows.filter((row) => !shouldIgnoreForSize(row.path) && row.added + row.removed < 5);
  if (small.length > CHRISTMAS_TREE_FILE_COUNT) {
    const list = small.map((row) => `- \`${row.path}\``).join('\n');
    warn(
      `${small.length} files have fewer than 5 changed lines (threshold: ${CHRISTMAS_TREE_FILE_COUNT}). Often signals shotgun edits. Files:\n${list}`,
    );
  }
}

function checkDirectorySpread(files: readonly string[]): void {
  const topLevel = new Set<string>();
  for (const path of files) {
    if (!path.startsWith('src/')) continue;
    const segments = path.slice('src/'.length).split('/');
    if (segments.length < 2) continue;
    const [first] = segments;
    if (first === undefined || first.length === 0) continue;
    topLevel.add(first);
  }
  if (topLevel.size > DIRECTORY_SPREAD_LIMIT) {
    const list = [...topLevel].map((dir) => `\`src/${dir}/\``).join(', ');
    warn(
      `PR touches ${topLevel.size} distinct directories under \`src/\` (threshold: ${DIRECTORY_SPREAD_LIMIT}): ${list}.`,
    );
  }
}

function checkPureAddition(rows: readonly NumstatRow[]): void {
  const counted = rows.filter((row) => !shouldIgnoreForSize(row.path));
  const totalAdds = counted.reduce((sum, row) => sum + row.added, 0);
  const totalDeletes = counted.reduce((sum, row) => sum + row.removed, 0);
  if (totalAdds > PURE_ADDITION_ADDS_THRESHOLD && totalDeletes < 10) {
    warn(
      `Diff adds ${totalAdds} lines and deletes only ${totalDeletes}. Consider whether existing code should have been modified instead of new code being added alongside it.`,
    );
  }
}

function hasSkipTestsTrailer(): boolean {
  return danger.git.commits.some((commit) => /^Skip-tests-justified:\s*\S/m.test(commit.message));
}

async function countAddedLines(paths: readonly string[]): Promise<number> {
  let total = 0;
  for (const path of paths) {
    const diff = await danger.git.diffForFile(path);
    if (diff === null) continue;
    total += diff.added.split('\n').length;
  }
  return total;
}

async function checkTestToProdRatio(): Promise<void> {
  const prodFiles = [...danger.git.created_files, ...danger.git.modified_files].filter((path) =>
    /^src\/.+\.ts$/.test(path),
  );
  const testFiles = [...danger.git.created_files, ...danger.git.modified_files].filter((path) =>
    /^test\/.+\.test\.ts$/.test(path),
  );
  if (prodFiles.length === 0) return;
  if (testFiles.length > 0) return;
  if (hasSkipTestsTrailer()) return;

  const prodLines = await countAddedLines(prodFiles);
  if (prodLines > 50) {
    fail(
      'Production files under `src/` changed with no matching test file added or modified. Add a test, or a `Skip-tests-justified: <reason>` trailer to justify.',
    );
  } else if (prodLines > 0) {
    warn(
      'Production files under `src/` changed with no matching test file. Add a test, or a `Skip-tests-justified: <reason>` trailer to justify.',
    );
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

async function checkAssertionDensity(): Promise<void> {
  const testFiles = [...danger.git.created_files, ...danger.git.modified_files].filter((path) =>
    /^test\/.+\.test\.ts$/.test(path),
  );
  let totalTests = 0;
  let totalAssertions = 0;
  for (const path of testFiles) {
    const diff = await danger.git.diffForFile(path);
    if (diff === null) continue;
    const added = diff.added;
    totalTests += countMatches(added, /\b(?:it|test|describe)(?:\.prop)?\s*\(/g);
    totalAssertions += countMatches(
      added,
      /\bexpect\s*\(|\bassert\s*\(|\bassert\.|\.toHaveBeenCalled/g,
    );
  }
  if (totalTests === 0) return;
  const density = totalAssertions / totalTests;
  if (density < MIN_ASSERTIONS_PER_TEST) {
    warn(
      `Added tests average ${density.toFixed(1)} assertions per block (threshold: ${MIN_ASSERTIONS_PER_TEST}, saw ${totalAssertions} assertions across ${totalTests} blocks). Thin tests rarely catch regressions.`,
    );
  }
}

interface EscapeHatchCount {
  readonly pattern: string;
  readonly count: number;
}

function countEscapeHatches(added: string): EscapeHatchCount[] {
  return [
    { pattern: 'as unknown as', count: countMatches(added, /\bas\s+unknown\s+as\b/g) },
    { pattern: 'as any', count: countMatches(added, /\bas\s+any\b/g) },
    { pattern: '@ts-expect-error', count: countMatches(added, /@ts-expect-error/g) },
    {
      pattern: 'eslint-disable',
      count: countMatches(added, /eslint-disable(?:-next-line|-line)?/g),
    },
    { pattern: 'biome-ignore', count: countMatches(added, /biome-ignore/g) },
  ].filter((entry) => entry.count > 0);
}

async function checkEscapeHatches(): Promise<void> {
  const tsFiles = [...danger.git.created_files, ...danger.git.modified_files].filter((path) =>
    /\.(?:ts|mts|tsx)$/.test(path),
  );
  const lines: string[] = [];
  for (const path of tsFiles) {
    const diff = await danger.git.diffForFile(path);
    if (diff === null) continue;
    const hits = countEscapeHatches(diff.added);
    if (hits.length === 0) continue;
    const summary = hits.map((hit) => `${hit.pattern} ×${hit.count}`).join(', ');
    lines.push(`- \`${path}\`: ${summary}`);
  }
  if (lines.length > 0) {
    warn(`Type escape hatches in added lines:\n${lines.join('\n')}`);
  }
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readPackageJson(ref: string | null): PackageManifest {
  const text =
    ref === null ? runGit(['show', 'HEAD:package.json']) : runGit(['show', `${ref}:package.json`]);
  return JSON.parse(text) as PackageManifest;
}

function addedKeys(
  before: Record<string, string> | undefined,
  after: Record<string, string> | undefined,
): string[] {
  const beforeKeys = new Set(Object.keys(before ?? {}));
  const afterKeys = Object.keys(after ?? {});
  return afterKeys.filter((key) => !beforeKeys.has(key));
}

function dependencyMapsDiffer(
  before: Record<string, string> | undefined,
  after: Record<string, string> | undefined,
): boolean {
  const beforeEntries = Object.entries(before ?? {});
  const afterEntries = Object.entries(after ?? {});
  if (beforeEntries.length !== afterEntries.length) return true;
  const beforeMap = new Map(beforeEntries);
  for (const [name, version] of afterEntries) {
    if (beforeMap.get(name) !== version) return true;
  }
  return false;
}

function checkDependencyDelta(base: string): void {
  const files = allChangedFiles();
  const packageChanged = files.includes('package.json');
  if (!packageChanged) return;
  const before = readPackageJson(base);
  const after = readPackageJson(null);
  const groups = [
    { label: 'dependencies', before: before.dependencies, after: after.dependencies },
    { label: 'devDependencies', before: before.devDependencies, after: after.devDependencies },
    { label: 'peerDependencies', before: before.peerDependencies, after: after.peerDependencies },
  ];
  const depsChanged = groups.some((group) => dependencyMapsDiffer(group.before, group.after));
  const lockChanged = files.includes('pnpm-lock.yaml');
  if (depsChanged && !lockChanged) {
    fail(
      '`package.json` dependencies changed without a corresponding `pnpm-lock.yaml` update. Run `pnpm install`.',
    );
  }
  for (const group of groups) {
    const added = addedKeys(group.before, group.after);
    if (added.length === 0) continue;
    const list = added.map((name) => `\`${name}\``).join(', ');
    warn(`New ${group.label}: ${list}. Verify the packages and versions before merging.`);
  }
}

function checkBuildOutputLeak(files: readonly string[]): void {
  const leaked = BUILD_OUTPUT_FILES.filter((name) => files.includes(name));
  if (leaked.length > 0) {
    fail(
      `Build output committed: ${leaked
        .map((name) => `\`${name}\``)
        .join(', ')}. These paths are gitignored — check your working tree.`,
    );
  }
}

function isReleasePleaseContext(): boolean {
  const branch = process.env['GITHUB_HEAD_REF'] ?? '';
  if (branch.startsWith('release-please--')) return true;
  const prUser = danger.github?.pr?.user?.login;
  if (prUser === 'tbhb-releases[bot]') return true;
  return danger.git.commits.some((commit) => {
    const author = commit.author?.name ?? '';
    return author === 'tbhb-releases[bot]';
  });
}

function checkReleaseManagedFiles(files: readonly string[]): void {
  const touched = RELEASE_MANAGED_FILES.filter((name) => files.includes(name));
  if (touched.length === 0) return;
  if (isReleasePleaseContext()) return;
  fail(
    `Release-managed files edited outside a release-please PR: ${touched
      .map((name) => `\`${name}\``)
      .join(', ')}. These files are owned by release-please — don't hand-edit.`,
  );
}

function versionSegments(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) return null;
  const [, a, b, c] = match;
  return [
    Number.parseInt(a ?? '0', 10),
    Number.parseInt(b ?? '0', 10),
    Number.parseInt(c ?? '0', 10),
  ];
}

function compareVersions(a: string, b: string): number {
  const as = versionSegments(a);
  const bs = versionSegments(b);
  if (as === null || bs === null) return 0;
  for (let i = 0; i < 3; i += 1) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function checkMinAppVersion(base: string, files: readonly string[]): void {
  if (!files.includes('manifest.json')) return;
  let before: { minAppVersion?: string };
  let after: { minAppVersion?: string };
  try {
    before = JSON.parse(runGit(['show', `${base}:manifest.json`])) as { minAppVersion?: string };
    after = JSON.parse(runGit(['show', 'HEAD:manifest.json'])) as { minAppVersion?: string };
  } catch {
    return;
  }
  const beforeVersion = before.minAppVersion;
  const afterVersion = after.minAppVersion;
  if (beforeVersion === undefined || afterVersion === undefined) return;
  if (compareVersions(afterVersion, beforeVersion) < 0) {
    warn(
      `\`manifest.json\` \`minAppVersion\` lowered from \`${beforeVersion}\` to \`${afterVersion}\`. Lowering it can break \`onUserEnable\` and \`onExternalSettingsChange\` semantics.`,
    );
  }
}

async function run(): Promise<void> {
  const base = resolveBase();
  const rows = parseNumstat(base);
  const files = allChangedFiles();

  checkSize(rows);
  checkChristmasTree(rows);
  checkDirectorySpread(files);
  checkPureAddition(rows);
  await checkTestToProdRatio();
  await checkAssertionDensity();
  await checkEscapeHatches();
  checkDependencyDelta(base);
  checkBuildOutputLeak(files);
  checkReleaseManagedFiles(files);
  checkMinAppVersion(base, files);
}

schedule(run());
