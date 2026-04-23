# obsidian-shell

An embedded terminal for [Obsidian][obsidian], powered by [xterm.js][xtermjs] and [node-pty][node-pty]. Desktop only. Bootstrapped from [obsidian-vite-sample-plugin][scaffold].

[obsidian]: https://obsidian.md/
[xtermjs]: https://xtermjs.org/
[node-pty]: https://github.com/microsoft/node-pty
[scaffold]: https://github.com/tbhb/obsidian-vite-sample-plugin

![A debugging note open next to an embedded shell running the Vitest suite, with the Shells sidebar showing attached and detached sessions.](docs/images/hero.png)

## Features

- Multi-session shells, one shell per Obsidian leaf. Tab labels number sessions Shell 1, Shell 2, and so on.
- Sessions survive pane drags and leaf closures. Reopen a detached shell from the sidebar or the fuzzy picker and its scrollback comes back with you.
- Left-sidebar `Shells` panel with a live list, state badges for attached, detached, and exited sessions, click-to-switch, and per-row stop buttons. Reachable from a ribbon icon.
- Obsidian theme integration. The `Follow Obsidian theme` toggle maps the vault's CSS variables into xterm's background, foreground, cursor, and selection colors.
- WebGL rendering that matches VS Code's terminal, with a DOM fallback for machines without a GPU context.
- Settings for shell path and arguments, starting directory strategy, font family with a monospace detector, font size, line height, cursor style and blink, scrollback, and copy on selection.
- First enable auto-opens a shell. Later enables and Hot Reload cycles leave the workspace alone.

## Commands

- **Open shell** reveals an existing terminal or opens one in the right sidebar.
- **New shell** always opens a fresh shell in a new tab.
- **Switch shell** opens a fuzzy picker of every tracked session.
- **Kill shell** and **Restart shell** act on the active terminal leaf.
- **Kill all shells** ends every session at once.
- **Open shells sidebar** reveals the `Shells` panel. The ribbon icon does the same.
- **Run self-test** spawns `uname` through node-pty and surfaces the output via a Notice. Handy when diagnosing a native-binary problem after a rebuild.

## Install

The plugin targets desktop Obsidian. The mobile app skips the plugin because node-pty can't load there.

### Via BRAT

[BRAT] offers the lowest-friction path while the plugin lives outside the community catalog. Open BRAT's "Add beta plugin" dialog and enter `tbhb/obsidian-shell`. BRAT downloads the latest release into `.obsidian/plugins/obsidian-shell/`, including the native binary for your platform. Enable `Shell` under **Settings → Community plugins**. The first enable opens a starter shell.

BRAT also tracks the `beta` branch. Opt into beta releases from BRAT's settings to receive `*-beta.N` builds as they ship.

### Manual install

Grab the latest [release][releases] and copy these assets into `.obsidian/plugins/obsidian-shell/`, creating the folder first if it doesn't exist:

- `main.js`
- `manifest.json`
- `styles.css`
- `pty-<platform>-<arch>.node` matching your system, such as `pty-darwin-arm64.node` on Apple silicon or `pty-linux-x64.node` on 64-bit Linux
- On macOS only, the matching `spawn-helper-<platform>-<arch>` file. Linux node-pty doesn't build one and Windows doesn't need one
- On Windows only, `conpty-win32-x64.node` and `conpty_console_list-win32-x64.node` alongside `pty-win32-x64.node`

On macOS, mark the spawn-helper executable:

```bash
chmod +x .obsidian/plugins/obsidian-shell/spawn-helper-*
```

Restart Obsidian or toggle community plugins off and on, then enable `Shell` under **Settings → Community plugins**.

[releases]: https://github.com/tbhb/obsidian-shell/releases

### From source

Contributors and anyone debugging a local build should follow the from-source setup in [`DEVELOPMENT.md`](DEVELOPMENT.md). That path compiles node-pty against Obsidian's Electron runtime via `pnpm rebuild:native`.

## Scripts

```bash
pnpm install         # install dependencies
pnpm dev             # vite build --watch (emits main.js into this folder)
pnpm build           # typecheck + production build
pnpm rebuild:native  # electron-rebuild against the pinned Electron version
pnpm test            # vitest run
pnpm test:watch      # vitest in watch mode
pnpm test:coverage   # vitest run --coverage, v8 provider, html+json reports
pnpm check           # biome check, lint + format + organize imports, then eslint
pnpm check:fix       # biome check --write + eslint --fix
pnpm lint            # biome lint + eslint, no formatter
pnpm lint:prose      # vale with file-discovery glob exclusions
pnpm format          # biome format --write
```

## Layout

```text
obsidian-shell/
├── manifest.json            # Obsidian plugin manifest
├── versions.json            # version -> minAppVersion map
├── vite.config.ts           # Vite 8 / Rolldown library-mode config
├── vitest.config.ts         # Vitest config, aliases `obsidian` to a stub
├── tsconfig.json            # strict TS, ES2022, bundler resolution
├── biome.json               # Biome lint + format config
├── eslint.config.mts        # ESLint flat config, only eslint-plugin-obsidianmd
├── src/
│   ├── main.ts              # plugin entry, commands, ribbon, event bus
│   ├── pty.ts               # node-pty loader + PtySession wrapper + self-test
│   ├── view.ts              # ShellView, an ItemView hosting xterm.js
│   ├── sidebar.ts           # ShellsView, the left-sidebar list
│   ├── picker.ts            # Switch shell FuzzySuggestModal
│   ├── settings.ts          # settings schema + mergeSettings + tab
│   └── styles.css           # Tailwind entry + @theme inline block
└── test/
    ├── __mocks__/obsidian.ts  # runtime stub of the obsidian module
    ├── setup.ts               # DOM helper polyfills
    ├── main.test.ts
    ├── settings.test.ts
    ├── sidebar.test.ts
    └── picker.test.ts
```

## Notes

- The plugin targets `minAppVersion` 1.7.2 so it can call `onUserEnable`, `onExternalSettingsChange`, and the modern view-state APIs.
- Node 22.22.0 pinned via `.node-version` matches Obsidian 1.12's Electron 39 runtime. node-pty prebuilds target a specific ABI, so the pinned Node also matches what `@electron/rebuild` needs for headers.
- Vite emits `main.js` and `styles.css` into the plugin root, not `dist/`, so Obsidian loads them directly. Both stay out of git.
- Sessions live on the plugin, not the view, so closing a leaf detaches the xterm without ending the shell. Reattaching replays buffered output.
- Coverage excludes `src/pty.ts` and `src/view.ts` because xterm needs a real renderer and node-pty needs the compiled binary. Every other source module stays at 100%.

## Stylesheet pipeline (Tailwind CSS 4)

Styling uses Tailwind CSS 4 via `@tailwindcss/vite`. The entry lives at `src/styles.css`. From there, `src/main.ts` imports it, and Vite emits the compiled result as `styles.css` in the plugin root alongside `main.js`, via `build.lib.cssFileName`.

Two deliberate choices for Obsidian compatibility:

- **Preflight off.** Tailwind's CSS reset conflicts with Obsidian's theme, so `src/styles.css` imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` layers individually and skips `tailwindcss/preflight.css`.
- **Utilities prefixed with `tw:`**, per v4's variant syntax. Usage: `createEl('p', { cls: 'tw:mt-4 tw:font-semibold tw:text-text-muted' })`, no risk of collision against core CSS, other plugins, or user snippets.

`@theme inline` in `src/styles.css` maps Obsidian's [CSS variables][obsidian-css-variables] into Tailwind's color palette so utilities like `tw:text-text-muted` and `tw:bg-background-primary` resolve against the live Obsidian theme and track light and dark switching automatically. Add new mappings in the same block.

[obsidian-css-variables]: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables

## Releases (release-please + BRAT)

[release-please] fully automates releases:

- **Stable channel.** Push [conventional commits][conventional-commits] to `main`. release-please opens a release PR that bumps `package.json` and `manifest.json`, appends an entry to `versions.json` keyed on the new version with `manifest.json`'s current `minAppVersion` as the value, and updates `CHANGELOG.md`. Merging the PR creates a bare-semver tag like `1.2.0`, with no `v` prefix as Obsidian requires, and a GitHub release. A follow-up job then runs `pnpm build` on the tag and uploads `main.js`, `manifest.json`, and `styles.css` as release assets.
- **Beta channel.** Push to `beta`. Same flow, but driven by `.github/release-please-config.beta.json`, which sets `"versioning": "prerelease"` and `"prerelease-type": "beta"`. That produces tags like `1.2.0-beta.1` and marks the GitHub release as a pre-release.

[release-please]: https://github.com/googleapis/release-please-action
[conventional-commits]: https://www.conventionalcommits.org/

`versions.json` needs a new entry on every release, not an in-place update. release-please has no built-in way to handle this. A workflow step syncs `versions.json` on the release PR branch so the new entry lands in the same commit as the version bump.

**BRAT compatibility.** [BRAT] works with the stable channel out of the box. For beta testers:

- Point them at `tbhb/obsidian-shell`, or wherever this repository lives, in BRAT's "Add beta plugin" dialog.
- Push betas to the `beta` branch. BRAT reads each release's `manifest.json` asset and respects GitHub's `prerelease: true` flag, so beta testers automatically get the `-beta.N` releases while users installing from the community catalog only see stable versions.
- Modern BRAT doesn't use the legacy `manifest-beta.json` file. It reads the GitHub release asset plus the pre-release flag.

[brat]: https://tfthacker.com/brat-developers

Release assets ship `main.js`, `manifest.json`, `styles.css`, and a flat `pty-<platform>-<arch>.node` file per supported platform. BRAT copies every asset into the plugin folder. The bundled node-pty loader in `main.js` selects the native matching the user's platform at runtime.

**Required `GITHUB_TOKEN` scopes.** The `release` workflow runs with `contents: write` and `pull-requests: write`, which the built-in `GITHUB_TOKEN` provides. No PATs required.

## Linting split

- **Biome** handles general linting, formatting, and import sorting. Fast, zero-config, single binary. Config: `biome.json`.
- **[ESLint][eslint]** runs [`eslint-plugin-obsidianmd`][obsidianmd-eslint], which enforces Obsidian [submission requirements][obsidian-submission] that Biome can't cover: sentence-case UI strings, no `innerHTML`, no `TFile` casts, settings-tab headings, command naming, and so on. Config: `eslint.config.mts`.

[eslint]: https://eslint.org/
[obsidianmd-eslint]: https://github.com/obsidianmd/eslint-plugin
[obsidian-submission]: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

## Development

Read [`DEVELOPMENT.md`](DEVELOPMENT.md) for the full contributor guide. It covers prerequisites, the inner development loop, the linting and testing gate, commit conventions, and the release pipeline. [`AGENTS.md`](AGENTS.md) has the condensed version aimed at AI coding agents, and Claude Code imports it automatically via [`CLAUDE.md`](CLAUDE.md).

## License

Released under the [MIT License](LICENSE).
