# AGENTS.md

Guidance for AI coding agents working in this repository. The plugin embeds a terminal inside [Obsidian][obsidian] via [xterm.js][xtermjs] and [node-pty][node-pty], and builds with [Vite 8][vite] ([Rolldown][rolldown]), [Tailwind CSS 4][tailwind], [Vitest 4][vitest], [Testing Library][testing-library], [Biome 2][biome], [TypeScript][typescript], and [pnpm][pnpm].

[obsidian]: https://obsidian.md/
[xtermjs]: https://xtermjs.org/
[node-pty]: https://github.com/microsoft/node-pty
[vite]: https://vite.dev/
[rolldown]: https://rolldown.rs/
[tailwind]: https://tailwindcss.com/
[vitest]: https://vitest.dev/
[testing-library]: https://testing-library.com/
[biome]: https://biomejs.dev/
[typescript]: https://www.typescriptlang.org/
[pnpm]: https://pnpm.io/

## Quickstart

Run these commands on a fresh clone:

```bash
pnpm install          # install dependencies + init husky hooks
pnpm rebuild:native   # compile node-pty against Electron 39 headers
pnpm typecheck        # tsc --noEmit on src + test configs
pnpm test             # vitest, 100% coverage gate
pnpm build            # typecheck + vite build
```

Run the full gate before pushing:

```bash
pnpm lint:all && pnpm typecheck && pnpm build && pnpm test:coverage
```

The pre-commit hook runs `nano-staged`. The pre-push hook runs typecheck and tests. Never bypass with `--no-verify`.

## Repository layout

```text
src/
├── main.ts                 # plugin entry, commands, ribbon, session event bus
├── pty.ts                  # node-pty loader + PtySession wrapper + self-test
├── view.ts                 # ShellView, an ItemView hosting xterm.js
├── sidebar.ts              # ShellsView, the left-sidebar list
├── picker.ts               # Switch shell FuzzySuggestModal
├── settings.ts             # settings schema + mergeSettings + tab
└── styles.css              # Tailwind entry + @theme inline block
test/
├── __mocks__/obsidian.ts   # runtime stub; the obsidian package ships types only
├── setup.ts                # jsdom polyfills + jest-dom matchers
└── *.test.ts               # one test file per coverage-tracked source module
.github/
├── workflows/ci.yml        # Lint, Build, Test, Documentation jobs
├── workflows/release.yml   # release-please + build + attest + upload
├── release-please-config.json
├── release-please-config.beta.json
├── release-please-manifest.json
└── dependabot.yml
manifest.json               # Obsidian plugin manifest
versions.json               # plugin version -> minAppVersion map
```

Config lives at the repo root: `biome.json`, `eslint.config.mts`, `cspell.json` + `cspell-words.txt`, `.rumdl.toml`, `.vale.ini` + `.vale/`, `.yamllint.yaml` + `.yamllintignore`, `commitlint.config.js`, `vite.config.ts`, `vitest.config.ts`, and both `tsconfig.json` plus `tsconfig.test.json`.

## Commands reference

```bash
pnpm dev              # vite build --watch
pnpm build            # tsc --noEmit + vite build
pnpm rebuild:native   # compile node-pty against Electron 39 headers
pnpm test             # vitest run
pnpm test:watch       # vitest in watch mode
pnpm test:coverage    # vitest run --coverage, enforces 100% thresholds
pnpm typecheck        # tsc on src and test tsconfigs
pnpm format           # biome format --write
pnpm format:markdown  # rumdl fmt .
pnpm lint             # biome lint + eslint
pnpm lint:markdown    # rumdl check
pnpm lint:prose       # vale
pnpm lint:spelling    # cspell
pnpm lint:yaml        # yamllint --strict
pnpm lint:actions     # actionlint
pnpm lint:all         # every lint above, one command
pnpm vale:sync        # download vale style packages
```

## Code style

- Two-space indentation for everything, enforced by Biome. Single quotes, semicolons, trailing commas, 100-char line width. See `biome.json`.
- `eslint-plugin-obsidianmd` handles Obsidian submission rules: sentence-case UI strings, no `innerHTML`, no `TFile` casts, no `mod-cta` misuse, and no plugin name inside a command label. ESLint runs only on `src/**/*.ts`.
- Strict TypeScript with ES2022 target, `noUncheckedIndexedAccess`, and `isolatedModules`. Two tsconfigs: `tsconfig.json` keeps real `obsidian` types for `src/`, while `tsconfig.test.json` aliases `obsidian` to the mock for tests.
- Avoid default exports except the plugin entry at `src/main.ts`.
- Use CSS classes, never inline styles. Tailwind utilities require the `tw:` prefix per v4 variant syntax. Hand-written classes live under `@layer components` in `src/styles.css`.

## Architecture

- **Sessions live on the plugin**, not the view. `ShellPlugin.sessions` maps a stable id to a `SessionEntry` that wraps a `PtySession`. Views attach and detach from sessions. They never own the process lifetime. `createSession`, `killSession`, and `killAllSessions` mutate the map and call `notifySessionsChanged` so the sidebar and anything else subscribed re-renders.
- **Per-leaf sessions.** Each `ShellView` carries a `sessionId` persisted through view state. `bindSession` either attaches to an existing entry or spawns a fresh one. The view uses a `sessionCreatedByThisView` flag so it can discard a placeholder session when `setState` arrives post-open with a different id. See the Obsidian gotchas below for the ordering details.
- **Two view types.** `SHELL_VIEW_TYPE`, `obsidian-shell`, hosts xterm.js inside a leaf. `SHELLS_VIEW_TYPE`, `obsidian-shell-list`, renders the left-sidebar list. Both register in `onload`. The ribbon icon and the `Open shells sidebar` command both target the sidebar view.
- **Picker and sidebar share plumbing.** `listSessions`, `isSessionAttached`, `describeSessionState`, and `switchToSession` compose the session surface both consumers use. `switchToSession` reveals an existing leaf, swaps the active terminal's binding, or opens a new leaf with `state.sessionId`, then routes focus to the xterm.

## Testing

- [Vitest 4][vitest] with `jsdom`.
- Coverage thresholds sit at 100% for statements, branches, functions, and lines. Don't lower the thresholds or add `/* v8 ignore */` comments without a clear rationale.
- `vitest.config.ts` excludes `src/pty.ts` and `src/view.ts`. xterm.js needs a real canvas or WebGL renderer, and node-pty needs a compiled native binary. Exercise those modules end-to-end inside Obsidian.
- The `obsidian` npm package ships types only. Tests resolve `obsidian` to `test/__mocks__/obsidian.ts` via the alias in `vitest.config.ts`. Extend the mock when new Obsidian API surface lands in source code.
- Tests that import `../src/main` transitively pull in `../src/view`, which pulls in `@xterm/xterm`. Stub `../src/view` with `vi.mock` so xterm never touches the jsdom DOM during tests.
- Stub `PtySession` from `../src/pty` as a `vi.fn()` constructor that stamps `isDead`, `attach`, `detach`, `write`, `resize`, `kill`, and `onExit` onto each instance. The plugin side of the session lifecycle gets full coverage through the stub.
- Settings-tab tests bypass Testing Library because the mocked `Setting` API can't render real form controls. They drive captured `onChange` callbacks directly via the mock's `__trigger()` helpers.

## Documentation linting

Every markdown, YAML, and workflow file ships through a gate before landing:

- `rumdl` for markdown structure
- `vale` for prose style. Enforces sentence case, active voice, contractions, short parentheticals, and concrete word choice
- `cspell` for spelling, backed by `cspell-words.txt`
- `yamllint` for YAML
- `actionlint` for GitHub Actions workflows

Add new technical terms to `cspell-words.txt` and to `.vale/config/vocabularies/obsidian-shell/accept.txt` when Vale flags them as spelling errors. Avoid em-dashes entirely, use commas or periods. Vale flags long parentheticals over 25 characters, so break them into separate sentences. Write each paragraph on a single line without hard wrapping. Use reference-style links with definitions at the bottom of their containing paragraph or section.

## Git workflow

- [Conventional commits][conventional-commits] via commitlint. Header under 100 characters. Body and footer under 120 characters per line.
- husky hooks, installed automatically by `pnpm install`:
  - `pre-commit` runs `nano-staged` across the staged files
  - `commit-msg` runs commitlint
  - `pre-push` runs `pnpm typecheck && pnpm test`
- Never use `--no-verify`. Fix the underlying failure.
- Work on a feature branch, open a PR, and merge via squash.

[conventional-commits]: https://www.conventionalcommits.org/

## Release process

- [release-please][release-please] and [BRAT][brat] handle releases. Configs live under `.github/`.
- Stable channel: push conventional commits to `main`. release-please opens a release PR that bumps `package.json` and `manifest.json`, appends to `versions.json`, and updates `CHANGELOG.md`. Merging creates a bare-semver tag like `1.2.0`, with no `v` prefix per Obsidian's convention, and a GitHub release. A follow-up job builds, attests via [SLSA provenance][slsa], then uploads the assets.
- Beta channel: push to the `beta` branch. Same flow, but driven by `.github/release-please-config.beta.json`. Produces `1.2.0-beta.1`-style tags marked as pre-releases. BRAT testers subscribe to these automatically.
- Only `feat:`, `fix:`, and commits with breaking changes trigger a release PR. `chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:`, and `build:` commits land without opening one.
- Release assets must include the compiled `node_modules/node-pty/build/Release/*.node` binary. Bundle the node-pty subtree the plugin needs at runtime into the release zip.
- Don't hand-edit `manifest.json` `version`, `package.json` `version`, `versions.json`, or `CHANGELOG.md`. Don't create tags manually. release-please owns those files.

[release-please]: https://github.com/googleapis/release-please-action
[brat]: https://tfthacker.com/brat-developers
[slsa]: https://slsa.dev/

## Obsidian gotchas

- `minAppVersion` stays at 1.7.2 so the plugin can call `onUserEnable` and `onExternalSettingsChange`.
- `onUserEnable` runs on every Hot Reload cycle and every explicit enable. The plugin gates auto-opening behind a `loadData()` null check and persists default settings on first run so later enables don't spawn surprise shells. Don't reintroduce unconditional view activation from that hook.
- Register listeners and intervals via `this.registerDomEvent()` and `this.registerInterval()` so they unload with the plugin.
- Gate desktop-only features behind `Platform.isMobile` checks.
- Use `createEl`, `createDiv`, and `createSpan` helpers. Never set `innerHTML`.
- The plugin id `obsidian-shell` must match the folder name under `.obsidian/plugins/` for local development.
- `src/pty.ts` loads `node-pty` via Electron's `window.require` at runtime. Never `import` it statically. Vite would try to bundle the native binary and fail.
- Run `pnpm rebuild:native` any time `node-pty` updates or the pinned Electron version changes. The compiled `node_modules/node-pty/build/Release/*.node` ships inside the plugin folder at release time.
- Obsidian doesn't guarantee `view.setState` fires before `onOpen` on newly created leaves. `ShellView.onOpen` seeds `sessionId` from `leaf.getViewState().state` before `bindSession` runs, and `setState` discards any placeholder session `bindSession` spawned when it arrives post-open with a different id. Preserve that ordering when editing the view.
- `setState` also fires with unrelated state on workspace restore, layout operations, and internal `setViewState` calls. Only update `sessionId` when `setState` explicitly provides a string. Clobbering the field to `null` strands live bindings.
- xterm.js can't resolve CSS custom properties through canvas metrics. Pass a concrete font stack resolved from `getComputedStyle(el).getPropertyValue('--font-monospace')` before handing it to `new Terminal` or `applySettings`.
- xterm's `FitAddon` reads `parentElement.height` via `getComputedStyle` but only subtracts padding it finds on the `.xterm` element. Adding padding to the host element silently overshoots. `ShellView` measures Obsidian's status-bar overlay at runtime and shrinks `contentEl` so the last row clears it.
- Obsidian's `ResizeObserver` runs more reliably than the `onResize` hook for pane moves. The terminal view observes `containerEl`, not `contentEl`, to avoid feedback loops from its own inline height writes.

## Rules at a glance

- Run the full gate before pushing.
- Add new technical terms to `cspell-words.txt` and the Vale vocabulary.
- Write reference-style markdown links with definitions at the bottom of the paragraph.
- Avoid em-dashes, passive voice, and italicized copulas in prose.
- Keep paragraphs on one line. No hard wrap.
- Don't force-push to `main` or `beta`.
- Don't bypass hooks.
- Don't hand-edit release-managed files.

## Further reading

- `README.md` for the user-facing overview
- `DEVELOPMENT.md` for the human developer guide
- `CHANGELOG.md` for release history
