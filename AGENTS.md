# AGENTS.md

Guidance for AI coding agents working in this repository. The scaffold targets the current [Obsidian][obsidian] plugin API and builds with [Vite 8][vite] ([Rolldown][rolldown]), [Tailwind CSS 4][tailwind], [Vitest 4][vitest], [Testing Library][testing-library], [Biome 2][biome], [TypeScript][typescript], and [pnpm][pnpm].

[obsidian]: https://obsidian.md/
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
├── main.ts                 # plugin entry, imports styles.css
├── settings.ts             # settings tab + mergeSettings helper
├── view.ts                 # custom ItemView
├── modal.ts                # modal
└── styles.css              # Tailwind entry + @layer components
test/
├── __mocks__/obsidian.ts   # runtime stub; the obsidian package ships types only
├── setup.ts                # jsdom polyfills + jest-dom matchers
└── *.test.ts               # one test file per source module
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
- `eslint-plugin-obsidianmd` handles Obsidian submission rules: sentence-case UI strings, no `innerHTML`, no `TFile` casts, no `mod-cta` misuse. ESLint runs only on `src/**/*.ts`.
- Strict TypeScript with ES2022 target, `noUncheckedIndexedAccess`, and `isolatedModules`. Two tsconfigs: `tsconfig.json` keeps real `obsidian` types for `src/`, while `tsconfig.test.json` aliases `obsidian` to the mock for tests.
- Avoid default exports except the plugin entry at `src/main.ts`.
- Use CSS classes, never inline styles. Tailwind utilities require the `tw:` prefix per v4 variant syntax. Hand-written classes live under `@layer components` in `src/styles.css`.

## Testing

- [Vitest 4][vitest] with `jsdom`.
- Coverage thresholds sit at 100% for statements, branches, functions, and lines. Don't lower the thresholds or add `/* v8 ignore */` comments without a clear rationale.
- The `obsidian` npm package ships types only. Tests resolve `obsidian` to `test/__mocks__/obsidian.ts` via the alias in `vitest.config.ts`.
- Tests attach `view.contentEl` and `modal.contentEl` to `document.body` in `beforeEach` so jest-dom's in-document matchers work. That mirrors Obsidian's runtime behavior.
- Settings-tab tests bypass Testing Library because the mocked `Setting` API doesn't render real form controls. They drive captured `onChange` callbacks directly via the mock's `__trigger()` helpers.

## Documentation linting

Every markdown, YAML, and workflow file ships through a gate before landing:

- `rumdl` for markdown structure
- `vale` for prose style. Enforces sentence case, active voice, contractions, short parentheticals, and concrete word choice
- `cspell` for spelling, backed by `cspell-words.txt`
- `yamllint` for YAML
- `actionlint` for GitHub Actions workflows

Add new technical terms to `cspell-words.txt`. Avoid em-dashes entirely, use commas or periods. Vale flags long parentheticals over 25 characters, so break them into separate sentences. Write each paragraph on a single line without hard wrapping. Use reference-style links with definitions at the bottom of their containing paragraph or section.

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
- Don't hand-edit `manifest.json` `version`, `package.json` `version`, `versions.json`, or `CHANGELOG.md`. Don't create tags manually. release-please owns those files.

[release-please]: https://github.com/googleapis/release-please-action
[brat]: https://tfthacker.com/brat-developers
[slsa]: https://slsa.dev/

## Obsidian gotchas

- `minAppVersion` stays at 1.7.2 so the plugin can call `onUserEnable` and `onExternalSettingsChange`.
- Open custom views from `onUserEnable`, never from `onload`.
- Register listeners and intervals via `this.registerDomEvent()` and `this.registerInterval()` so they unload with the plugin.
- Gate desktop-only features behind `Platform.isMobile` checks.
- Use `createEl`, `createDiv`, and `createSpan` helpers. Never set `innerHTML`.
- The plugin id `obsidian-terminal` must match the folder name under `.obsidian/plugins/` for local development.

## Rules at a glance

- Run the full gate before pushing.
- Add new technical terms to `cspell-words.txt`.
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
