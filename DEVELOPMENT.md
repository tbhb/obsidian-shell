# Development guide

A walkthrough for humans contributing to `obsidian-terminal`. For the short version aimed at AI coding agents, see [`AGENTS.md`](AGENTS.md).

## Prerequisites

You need these on your machine before the first `pnpm install`:

- [Node.js][nodejs] 22.22.0, pinned in `.node-version` to match Obsidian 1.12's Electron 39 runtime. [mise][mise], `fnm`, `nvm`, or any other tool that reads `.node-version` picks it up automatically.
- [pnpm][pnpm] 10.32.1, pinned through the `packageManager` field and resolved by [Corepack][corepack]
- A C++ toolchain that `node-gyp` can find. On macOS, install the Xcode Command Line Tools with `xcode-select --install`. On Linux, install `build-essential` or the matching distro package. On Windows, install the Visual Studio Build Tools together with Python 3.
- A shell capable of running POSIX scripts. macOS, Linux, or WSL all work.

Three linters in the full gate live outside npm. Install them via your package manager before running `pnpm lint:all`:

- [rumdl][rumdl] for markdown. Grab it from Homebrew or install via `cargo install rumdl`.
- [vale][vale] for prose. Install from Homebrew or download a release binary.
- [actionlint][actionlint] for GitHub Actions workflows. Homebrew works here too.

`yamllint` runs through `uvx` in CI, so it doesn't need a local install. Homebrew works if you prefer running the raw binary.

[nodejs]: https://nodejs.org/
[mise]: https://mise.jdx.dev/
[pnpm]: https://pnpm.io/
[corepack]: https://nodejs.org/api/corepack.html
[rumdl]: https://github.com/rvben/rumdl
[vale]: https://vale.sh/
[actionlint]: https://github.com/rhysd/actionlint

## First-time setup

Clone the repository into any Obsidian vault's plugins directory and install dependencies:

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/tbhb/obsidian-terminal.git
cd obsidian-terminal
pnpm install
pnpm rebuild:native
pnpm build
```

`pnpm install` runs the `prepare` script, which invokes husky and wires the git hooks into `.husky/_`. From that point on, every commit and push flows through the local lint and test gates automatically.

`pnpm rebuild:native` must run on every fresh checkout. node-pty ships only source and Node-targeted prebuilds, so the plugin needs a local compile against Electron 39 headers before Obsidian can load it. Re-run the command any time node-pty bumps or the pinned Electron version changes.

Before the first run, sync Vale's style packages:

```bash
pnpm vale:sync
```

That downloads Google, write-good, proselint, and the AI-tells packages into `.vale/`. The downloads go into gitignored subdirectories. The project-specific style under `.vale/obsidian-terminal/` and the vocabulary under `.vale/config/vocabularies/obsidian-terminal/` stay committed.

## Development loop

Run the Vite watcher in one terminal:

```bash
pnpm dev
```

That runs `vite build --watch` on top of Rolldown. Every save under `src/` emits a fresh `main.js` and `styles.css` at the plugin root, and enabling the plugin inside Obsidian picks up the new build after a reload. The [Hot Reload][hot-reload] community plugin handles that reload for you automatically.

Hot Reload cycles the plugin on every `main.js` or `styles.css` write, so `onload` and `onUserEnable` fire each time. `onUserEnable` gates auto-opening a shell behind a `loadData()` null check, so Hot Reload cycles don't spawn new terminals. Delete `data.json` if you want to hit the first-run flow again.

In a second terminal, run tests in watch mode:

```bash
pnpm test:watch
```

Vitest re-runs affected tests whenever you save a file under `src/` or `test/`. The full coverage gate runs via `pnpm test:coverage` on demand and in CI.

[hot-reload]: https://github.com/pjeby/hot-reload

## Testing the plugin inside Obsidian

With `pnpm dev` running, open your vault. Go to **Settings → Community plugins** and toggle **Terminal** on. On first enable, the plugin persists its default settings and opens a starter shell in the right sidebar.

What you can exercise from there:

- **Commands** via `Cmd+P`: `Open shell`, `New shell`, `Switch shell`, `Kill shell`, `Restart shell`, `Kill all shells`, `Open shells sidebar`, `Run self-test`.
- **Ribbon icon** (terminal-square): reveals the `Shells` sidebar panel.
- **Sidebar rows**: click to switch to a session, click the `×` to end one. Rows reflect attached, detached, and exited state live as sessions change.
- **Settings tab**: shell path and args, starting directory, font family picker with a monospace detector, font size, line height, cursor style, theme integration, scrollback, copy on selection.
- **Self-test command**: spawns `/usr/bin/uname -a` through node-pty and shows the output via a Notice. Use it to diagnose native-module problems right after a rebuild.

Edits to `src/` rebuild automatically. Hot Reload re-enables the plugin when the new files land.

## Linting

The scaffold uses one linter per domain. Nothing overlaps, so each tool has a clear job:

| Tool | Domain | Config |
| --- | --- | --- |
| Biome | TypeScript, JavaScript, JSON, CSS. Format, lint, import sort. | `biome.json` |
| ESLint | Obsidian submission rules, via `eslint-plugin-obsidianmd` | `eslint.config.mts` |
| rumdl | Markdown structure | `.rumdl.toml` |
| vale | Prose style and sentence case | `.vale.ini` + `.vale/` |
| cspell | Spelling across all text files | `cspell.json` + `cspell-words.txt` |
| yamllint | YAML structure and line length | `.yamllint.yaml` + `.yamllintignore` |
| actionlint | GitHub Actions workflow correctness | runs on `.github/workflows/*.yml` |

Run every linter with one command:

```bash
pnpm lint:all
```

Each `lint:*` script runs a single tool. Check `package.json` for the full list. For formatters, `pnpm format` runs Biome and `pnpm format:markdown` runs rumdl's formatter.

### Fixing common lint failures

- **Biome complains about formatting.** Run `pnpm format`. Biome handles indentation, quote style, trailing commas, and import sort automatically.
- **ESLint flags an Obsidian rule.** Read the rule name, then jump to `eslint-plugin-obsidianmd` docs. Common ones: sentence-case UI strings, no `innerHTML`, no plugin name inside a command label.
- **rumdl reports `MD040` missing language.** Add a language hint after the opening triple backticks. Use `text` for plain output.
- **vale reports unknown words.** Add the term to `.vale/config/vocabularies/obsidian-terminal/accept.txt`. The file accepts one regular expression per line.
- **cspell reports unknown words.** Add them to `cspell-words.txt`, one per line.
- **yamllint reports a long line.** Break the value across lines with a folded scalar, or add `# yamllint disable-line rule:line-length` at the end of the line.
- **actionlint reports a shellcheck issue.** Most of these flag unquoted variables. Fix them in place.

## Testing

Vitest runs with `jsdom` against a mock of the `obsidian` module. Read `test/__mocks__/obsidian.ts` to see what the mock exposes. Extend it when a test needs more of the API surface.

### Coverage

The gate enforces 100% coverage across statements, branches, functions, and lines. Thresholds live in `vitest.config.ts` and fail the build if any metric slips. The `perFile: true` setting means a single uncovered file breaks CI, not just the average.

`vitest.config.ts` excludes `src/pty.ts` and `src/view.ts` from coverage because they need Electron's `window.require` and a real canvas or WebGL renderer. Exercise those modules end-to-end inside Obsidian via the self-test command and the terminal view.

When a genuine need arises to exclude a line from a covered module, add `/* v8 ignore next */` with a comment explaining why. Don't lower the thresholds without a documented reason.

### Stubbing the runtime-only modules

Tests that import `../src/main` transitively pull in `../src/view`, which imports `@xterm/xterm` and touches the DOM at construction time. Stub `../src/view` with `vi.mock` so xterm never loads in jsdom:

```ts
vi.mock('../src/view', () => ({
  TERMINAL_VIEW_TYPE: 'obsidian-terminal',
  TerminalView: class {
    constructor(public leaf: unknown, public plugin: unknown) {}
    applySettings = vi.fn();
    reattachSession = vi.fn();
    attachToSession = vi.fn();
    focusTerminal = vi.fn();
    getSessionId = vi.fn(() => null as string | null);
  },
}));
```

Stub `PtySession` from `../src/pty` as a `vi.fn()` constructor that stamps `isDead`, `attach`, `detach`, `write`, `resize`, `kill`, and `onExit` onto each instance. The plugin's session lifecycle then runs against a controllable fake without needing node-pty on disk.

### Testing Library patterns

UI tests use [Testing Library][testing-library] queries like `getByRole`, `getByText`, and `within` rather than ad-hoc `querySelector` calls. `@testing-library/jest-dom` matchers such as `toBeInTheDocument`, `toHaveTextContent`, and `toHaveClass` register via `test/setup.ts`.

Tests attach `view.contentEl` and `modal.contentEl` to `document.body` in `beforeEach` so jest-dom's in-document matchers work. That mirrors the runtime attachment inside Obsidian.

Settings-tab tests bypass Testing Library on purpose. The mocked `Setting` API can't render real form controls, so tests invoke the captured `onChange` callbacks directly via the mock's `__trigger()` helpers.

[testing-library]: https://testing-library.com/

## Commit conventions

All commits follow [Conventional Commits][conventional-commits]. commitlint enforces the rules automatically via the `commit-msg` git hook.

Valid types:

- `feat`: new user-facing feature. Bumps the minor version
- `fix`: bug fix. Bumps the patch version
- `docs`: documentation only
- `chore`: tooling, dependencies, repo housekeeping
- `refactor`: code change that neither fixes a bug nor adds a feature
- `perf`: performance improvement
- `test`: add or update tests
- `build`: build system or dependency changes
- `ci`: CI configuration
- `style`: formatting, whitespace, missing semicolons
- `revert`: revert a previous commit

Append `!` or a `BREAKING CHANGE:` footer for breaking changes. The subject line stays under 100 characters. Body and footer lines stay under 120.

[conventional-commits]: https://www.conventionalcommits.org/

## Release process

Releases run through [release-please][release-please] on every push to `main`. The workflow scans conventional commits since the last tag. When it finds a `feat:`, `fix:`, or breaking change, it opens a release PR with:

- a version bump in `package.json`, `manifest.json`, and `.github/release-please-manifest.json`
- a new entry appended to `versions.json`
- a `CHANGELOG.md` update

Review the release PR and merge it via squash. Merging creates a GitHub release tagged with bare semver, with no `v` prefix per Obsidian's convention. A follow-up job then runs `pnpm build`, generates a [SLSA provenance][slsa] attestation via sigstore, then uploads `main.js`, `main.js.map`, `manifest.json`, and `styles.css` as release assets.

Release assets must also include the compiled node-pty subtree. BRAT installs unpack the zip into `.obsidian/plugins/<id>/` verbatim, so `node_modules/node-pty/build/Release/*.node` needs to travel with the build. Update the release workflow when the packaging strategy changes.

Pushes to the `beta` branch run the same flow through `.github/release-please-config.beta.json`, producing pre-release tags like `1.2.0-beta.1` that only [BRAT][brat] testers see.

**Don't hand-edit release-managed files.** release-please owns `manifest.json` version, `package.json` version, `versions.json`, `CHANGELOG.md`, and the git tags.

[release-please]: https://github.com/googleapis/release-please-action
[slsa]: https://slsa.dev/
[brat]: https://tfthacker.com/brat-developers

### Verifying a release

Anyone can verify that a release asset came from the workflow on `main`:

```bash
gh release download 1.2.0 -R tbhb/obsidian-terminal -p 'main.js'
gh attestation verify main.js --repo tbhb/obsidian-terminal
```

A clean exit means sigstore confirms the asset matches the one the release workflow signed, with the OIDC identity tracing back to the exact workflow run on a GitHub-hosted runner.

## Troubleshooting

### `pnpm rebuild:native` fails with `xcode-select: Failed to locate 'clang++'`

Install or reinstall the Xcode Command Line Tools: `xcode-select --install`. The node-gyp build drives the system toolchain and needs a working `clang++` on `PATH`.

### `pnpm rebuild:native` fails with `EPERM` writing to `~/.electron-gyp`

A sandbox or file-permissions problem. Run the command outside any restricted shell. Delete `~/.electron-gyp` and retry so node-gyp repopulates the cache.

### The plugin loads but `Run self-test` shows "native binary missing"

Either `pnpm rebuild:native` hasn't run, or the compiled binary targets a different Electron ABI than Obsidian's current runtime. Read `Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist` on macOS to confirm the installed Electron version, then re-run the rebuild with a matching `--version` flag if it drifts from the pinned 39.7.0.

### `pnpm install` warns about peer dependencies

The scaffold tracks a newer `obsidian` package than `eslint-plugin-obsidianmd` lists in its peer range, so a `pnpm.peerDependencyRules.allowedVersions` override in `package.json` silences the warning. Update the override if a dependency bump reintroduces it.

### `pnpm build` fails on `src/styles.css`

Biome can't parse Tailwind v4 directives. An exclusion in `biome.json` already handles that, and you only need to add it back if it drops out.

### Tests fail with `Cannot find package 'obsidian'`

Run through pnpm instead of Bun. Obsidian's npm package ships types only, so Vitest relies on a mock alias in `vitest.config.ts` to provide a runtime shim. Bun has its own reserved `test` subcommand that bypasses `package.json` scripts entirely and ignores that alias.

### A hook refuses to run

Run `pnpm run prepare` to regenerate the `.husky/_` wrapper directory.

### `vale` complains about unknown words

Extend `.vale/config/vocabularies/obsidian-terminal/accept.txt`. That file takes one regular expression per line. Prefer spelling out proper names in full and reach for a broad pattern like `[A-Z]{2,}` only as a last resort.

### CI fails on a rumdl rule for `CHANGELOG.md`

release-please owns the changelog format and emits `*` list markers plus leading blank lines that clash with the rumdl style. An exclusion in `.rumdl.toml` keeps rumdl off the file. Put it back if it goes missing.

### A shell tab opens every time the plugin reloads

The first-enable heuristic reads `loadData()` and treats a null return as a fresh install. Delete `data.json` to reset the flag. Reinstalling the plugin clears it too. If Hot Reload spawns shells on reload, check whether something removed `data.json` between reloads.

## See also

- [`README.md`](README.md) for the user-facing overview
- [`AGENTS.md`](AGENTS.md) for the condensed agent guide
- [`CHANGELOG.md`](CHANGELOG.md) for release history
