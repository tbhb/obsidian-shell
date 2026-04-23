# Releasing

Releases run through [release-please][release-please]. Each release publishes a full set of assets to GitHub for manual download. Obsidian's [community catalog][obsidian-community] and [BRAT][brat] only deliver `main.js`, `manifest.json`, and `styles.css`. Neither carries this plugin's per-platform native binaries, so installation stays manual until a distribution fix lands.

release-please handles version bumps, the changelog, and release creation. Human maintainers review release PRs before merging.

[release-please]: https://github.com/googleapis/release-please-action
[brat]: https://tfthacker.com/brat-developers
[obsidian-community]: https://obsidian.md/plugins

## Single-branch prerelease flow

Push [conventional commits][conventional-commits] to `main`. release-please opens a release PR. The PR updates `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md`. The new `versions.json` key maps the version to the current `minAppVersion`. Merging the PR creates a bare-semver tag, with no `v` prefix per Obsidian's convention, and a GitHub release. A follow-up job runs `pnpm build` on the tag, generates a [SLSA provenance][slsa] attestation via sigstore, and uploads the release assets.

### Stable vs beta

- **Stable release.** A normal `feat` or `fix` bump produces a tag like `1.2.0`. The GitHub release stays unmarked. Users pulling via the community catalog or via manual install see this release as the latest.
- **Beta release.** Add a `Release-As: 1.2.0-beta.1` footer to a qualifying commit. release-please cuts a release at that exact version. GitHub flags the release as prerelease automatically because the version carries a prerelease qualifier. BRAT's beta-tester flow honors that flag, so opted-in users get the beta without any branch-level distinction.

Only `feat:`, `fix:`, and commits with breaking changes trigger a release PR on their own. `chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:`, and `build:` commits land without opening one, unless they carry a `Release-As:` footer.

[conventional-commits]: https://www.conventionalcommits.org/
[slsa]: https://slsa.dev/

## Release assets

Each release ships a flat set of files. Users copy the assets they need into `.obsidian/plugins/<id>/` by hand, and the bundled node-pty loader in `main.js` picks the native matching `process.platform + '-' + process.arch` at runtime.

Common assets across all releases:

- `main.js` and `main.js.map`
- `manifest.json`
- `styles.css`

Per-platform natives produced by the build matrix:

- `pty-darwin-arm64.node`, `pty-darwin-x64.node`
- `pty-linux-x64.node`, `pty-linux-arm64.node`
- `pty-win32-x64.node` plus the ConPTY peers `conpty-win32-x64.node` and `conpty_console_list-win32-x64.node`
- `spawn-helper-darwin-arm64` and `spawn-helper-darwin-x64`. Linux node-pty doesn't build a spawn-helper and Windows doesn't need one.

## versions.json sync

`versions.json` maps each plugin version to its `minAppVersion`. Obsidian requires a new entry on every release rather than an in-place update, and release-please has no built-in way to append a key. The release workflow runs a sync step on the release PR branch so the new entry lands in the same commit as the version bump. The step skips entries that already exist.

## Workflow permissions

The `release` workflow runs with the built-in `GITHUB_TOKEN` and the following scopes. No personal access tokens needed.

- `contents: write` for tagging, creating the release, and uploading assets
- `pull-requests: write` for opening the release-please PR
- `id-token: write` on the publish job for the sigstore OIDC exchange
- `attestations: write` on the publish job for the SLSA provenance attestation

## Verifying a release

Anyone can verify that a release asset came from the workflow on `main`:

```bash
gh release download 1.2.0 -R tbhb/obsidian-shell -p 'main.js'
gh attestation verify main.js --repo tbhb/obsidian-shell
```

A clean exit means sigstore confirms the asset matches the one the release workflow signed, with the OIDC identity tracing back to the exact workflow run on a GitHub-hosted runner.

## What not to hand-edit

release-please owns the following files. Don't edit them by hand and don't create tags manually.

- `manifest.json` `version` field
- `package.json` `version` field
- `versions.json`
- `CHANGELOG.md`
- `.github/release-please-manifest.json`
- Git tags
