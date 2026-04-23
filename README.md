# obsidian-terminal

An embedded terminal for [Obsidian][obsidian], powered by [xterm.js][xtermjs] and [node-pty][node-pty]. Desktop only.

[obsidian]: https://obsidian.md/
[xtermjs]: https://xtermjs.org/
[node-pty]: https://github.com/microsoft/node-pty

**Status:** scaffolding stage. The plugin boots and registers an empty settings tab. The terminal view and pseudoterminal backend land in follow-up work. Bootstrapped from [obsidian-vite-sample-plugin][scaffold].

[scaffold]: https://github.com/tbhb/obsidian-vite-sample-plugin

## Scripts

```bash
pnpm install         # install dependencies
pnpm dev             # vite build --watch (emits main.js into this folder)
pnpm build           # typecheck + production build
pnpm test            # vitest run
pnpm test:watch      # vitest in watch mode
pnpm test:coverage   # vitest run --coverage (v8 provider, html+json reports)
pnpm check           # biome check (lint + format + organize imports) + eslint
pnpm check:fix       # biome check --write + eslint --fix
pnpm lint            # biome lint + eslint (no formatter)
pnpm lint:prose      # vale with file-discovery glob exclusions
pnpm format          # biome format --write
```

### Stylesheet pipeline (Tailwind CSS 4)

Styling uses Tailwind CSS 4 via `@tailwindcss/vite`. The entry lives at `src/styles.css`. From there, `src/main.ts` imports it, and Vite emits the compiled result as `styles.css` in the plugin root alongside `main.js`, via `build.lib.cssFileName`. Both files stay out of git. Publish them through GitHub releases.

Two deliberate choices for Obsidian compatibility:

- **Preflight off.** Tailwind's CSS reset conflicts with Obsidian's theme, so `src/styles.css` imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` layers individually and skips `tailwindcss/preflight.css`.
- **All utilities prefixed with `tw:`** (v4's variant syntax). Usage: `createEl('p', { cls: 'tw:mt-4 tw:font-semibold tw:text-text-muted' })`, with no risk of collision against core CSS, other plugins, or user snippets.

`@theme inline` in `src/styles.css` maps Obsidian's [CSS variables][obsidian-css-variables] into Tailwind's color palette, so utilities like `tw:text-text-muted` and `tw:bg-background-primary` resolve against the live Obsidian theme and track light/dark switching automatically. Add new mappings in the same block.

[obsidian-css-variables]: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables

### Releases (release-please + BRAT)

[release-please] fully automates releases:

- **Stable channel.** Push [conventional commits][conventional-commits] to `main`. release-please opens a release PR that bumps `package.json` and `manifest.json`, appends an entry to `versions.json` keyed on the new version with `manifest.json`'s current `minAppVersion` as the value, and updates `CHANGELOG.md`. Merging the PR creates a bare-semver tag like `1.2.0`, with no `v` prefix as Obsidian requires, and a GitHub release. A follow-up job then runs `pnpm build` on the tag and uploads `main.js`, `manifest.json`, and `styles.css` as release assets.
- **Beta channel.** Push to `beta`. Same flow, but driven by `.github/release-please-config.beta.json`, which sets `"versioning": "prerelease"` and `"prerelease-type": "beta"`. That produces tags like `1.2.0-beta.1` and marks the GitHub release as a pre-release.

[release-please]: https://github.com/googleapis/release-please-action
[conventional-commits]: https://www.conventionalcommits.org/

`versions.json` needs a new entry on every release, not an in-place update. release-please has no built-in way to handle this. A workflow step syncs `versions.json` on the release PR branch so the new entry lands in the same commit as the version bump.

**BRAT compatibility.** [BRAT] works with the stable channel out of the box. For beta testers:

- Point them at `tbhb/obsidian-terminal`, or wherever this repository lives, in BRAT's "Add beta plugin" dialog.
- Push betas to the `beta` branch. BRAT reads each release's `manifest.json` asset and respects GitHub's `prerelease: true` flag, so beta testers automatically get the `-beta.N` releases while users installing from the community catalog only see stable versions.
- Modern BRAT doesn't use the legacy `manifest-beta.json` file. It reads the GitHub release asset plus the pre-release flag.

[brat]: https://tfthacker.com/brat-developers

**Required `GITHUB_TOKEN` scopes.** The `release` workflow runs with `contents: write` and `pull-requests: write`, which the built-in `GITHUB_TOKEN` provides. No PATs required.

### Linting split

- **Biome** handles general linting, formatting, and import sorting. Fast, zero-config, single binary. Config: `biome.json`.
- **[ESLint][eslint]** exists solely to run [`eslint-plugin-obsidianmd`][obsidianmd-eslint], which enforces Obsidian [submission requirements][obsidian-submission] that Biome doesn't cover: sentence-case UI strings, no `innerHTML`, no `TFile` casts, settings-tab headings, command naming, and so on. Config: `eslint.config.mts`.

[eslint]: https://eslint.org/
[obsidianmd-eslint]: https://github.com/obsidianmd/eslint-plugin
[obsidian-submission]: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

## Layout

```text
obsidian-terminal/
├── manifest.json            # Obsidian plugin manifest
├── versions.json            # version -> minAppVersion map
├── vite.config.ts           # Vite 8 / Rolldown library-mode config
├── vitest.config.ts         # Vitest config (aliases `obsidian` to a stub)
├── tsconfig.json            # strict TS, ES2022, bundler resolution
├── biome.json               # Biome lint + format config
├── eslint.config.mts        # ESLint flat config, only eslint-plugin-obsidianmd
├── src/
│   ├── main.ts              # Plugin entry
│   ├── settings.ts          # Settings tab + DEFAULT_SETTINGS + mergeSettings
│   └── styles.css           # Tailwind entry + @theme inline block
└── test/
    ├── __mocks__/obsidian.ts  # runtime stub of the obsidian module
    ├── setup.ts               # DOM helper polyfills (createEl, empty, ...)
    ├── main.test.ts
    └── settings.test.ts
```

## Notes

- The `obsidian` npm package ships types only, so tests run against a local stub aliased in `vitest.config.ts`. Extend `test/__mocks__/obsidian.ts` as you reach for more of the API.
- Vite emits `main.js` into the plugin folder (not `dist/`) so Obsidian loads it directly. Git ignores it. Publish it through GitHub releases.
- The plugin targets `minAppVersion` 1.7.2 to use `onUserEnable` and `onExternalSettingsChange`.
- Node 22.22.0 pinned via `.node-version` matches Obsidian 1.12's Electron 39 runtime. node-pty's native binaries require that alignment.

## Development

Read [`DEVELOPMENT.md`](DEVELOPMENT.md) for the full contributor guide. It covers prerequisites, the inner development loop, the linting and testing gate, commit conventions, and the release pipeline. [`AGENTS.md`](AGENTS.md) has the condensed version aimed at AI coding agents, and Claude Code imports it automatically via [`CLAUDE.md`](CLAUDE.md).

## License

Released under the [MIT License](LICENSE).
