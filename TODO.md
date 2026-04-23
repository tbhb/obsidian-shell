# TODO

Running backlog for `obsidian-terminal`. Groups sorted roughly by urgency. Order inside each group stays free-form. Drop or check off as they land.

## Distribution

- [ ] Release packaging: bundle the compiled `node_modules/node-pty/build/Release/*.node` plus the node-pty wrapper subtree the runtime `window.require` loads into the release zip so BRAT installs work without running `pnpm rebuild:native` locally. Update `.github/workflows/release.yml`.
- [ ] CI build matrix for `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`. Stage native binaries per platform and stitch them into the final release asset, or document a "macOS arm64 only" v1 scope.
- [ ] Post-install verification step: after `pnpm rebuild:native`, confirm the binary exists and runs against the Electron ABI the manifest expects. Fail fast with a useful error.

## Keyboard

- [ ] Obsidian hotkeys versus xterm input. Decide a passthrough policy. VS Code uses an allowlist via `commandsToSkipShell`. Obsidian's `Scope` API looks like the right tool; xterm grabs `onKey` early.
- [ ] `Ctrl+Shift+C` and `Ctrl+Shift+V` for copy and paste so xterm's built-in mappings stop fighting the OS shortcuts on Linux.

## Settings gaps

- [ ] `shell.env` map in the settings tab. Needs a custom UI for key-value pairs. For now callers rely on the inherited `process.env`.
- [ ] Per-platform shell overrides. Mirror VS Code's `defaultProfile.{windows,osx,linux}` shape in settings.
- [ ] Auto-stop orphan timeout. Sessions currently survive indefinitely until the plugin unloads. An optional "detach for longer than N minutes" cleanup would keep the sessions map tidy.
- [ ] `splitCwd` strategy: reuse the current leaf's cwd when a new shell opens via split instead of always re-resolving via `resolveCwd`.

## Session persistence

- [ ] Serialize scrollback and label via `@xterm/addon-serialize` on unload. Restore when the view opens so state survives an Obsidian restart, not just pane moves.
- [ ] Investigate whether node-pty can fork a "recoverable" shell. Some pseudoterminal layers support reattachment across process restart; most don't.

## Sidebar polish

- [ ] Row context menu with rename, stop, and stop-and-close-leaf actions.
- [ ] Session count in the status bar as an optional, passive indicator.
- [ ] Drag-to-reorder rows so the user controls session order rather than creation order.
- [ ] Empty state tweak: link from the sidebar directly to the `New shell` command.

## Known edges

- [ ] Two terminal leaves force-opened against the same session both attach and fight for the pseudoterminal writer. Either block the second attach or document the behavior. `activateView` already reveals instead of duplicating, so this only hits when a user explicitly splits a terminal tab.
- [ ] Dynamic status-bar clearance: the current measurement reads once per resize. Re-measure on theme change via `workspace.on('css-change')` so a taller status bar from a custom theme doesn't clip the last row until the next layout event.

## Testing and CI

- [ ] Smoke test that exercises `pnpm rebuild:native` inside the CI build. Failing early on ABI drift beats discovering it on first plugin load.
- [ ] End-to-end test that drives a headless Obsidian through the view open flow plus the `Run self-test` command, asserting against the Notice text. Hard to set up but removes the whole "does the native side actually load" blind spot.

## Docs

- [ ] Screenshots or a short animation in the README showing the sidebar, picker, and a shell in action.
- [ ] `CONTRIBUTING.md` with the short form of `DEVELOPMENT.md` aimed at external contributors.
