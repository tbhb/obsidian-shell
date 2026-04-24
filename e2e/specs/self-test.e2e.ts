import { chmodSync, copyFileSync, existsSync } from 'node:fs';
import { arch, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const NATIVE_SRC = path.join(REPO_ROOT, 'node_modules', 'node-pty', 'build', 'Release');
const PLATFORM_ARCH = `${platform()}-${arch()}`;

// wdio-obsidian-service installs manifest.json + main.js + styles.css into the
// vault's plugin folder but not the native binaries node-pty needs. Stage them
// ourselves after the vault copy exists, before enabling the plugin.
async function stageNativesAndEnable(): Promise<void> {
  const vaultPath: string = await browser.execute(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian runtime global
    return (globalThis as any).app.vault.adapter.basePath;
  });
  const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'obsidian-shell');
  const ptySrc = path.join(NATIVE_SRC, 'pty.node');
  const helperSrc = path.join(NATIVE_SRC, 'spawn-helper');
  if (!existsSync(ptySrc)) {
    throw new Error(`missing ${ptySrc} — run pnpm rebuild:native before the e2e suite`);
  }
  copyFileSync(ptySrc, path.join(pluginDir, `pty-${PLATFORM_ARCH}.node`));
  if (existsSync(helperSrc)) {
    const helperDst = path.join(pluginDir, `spawn-helper-${PLATFORM_ARCH}`);
    copyFileSync(helperSrc, helperDst);
    chmodSync(helperDst, 0o755);
  }
  await obsidianPage.enablePlugin('obsidian-shell');
}

// TODO(e2e-PTY): Un-skip once node-pty works under wdio-obsidian-service's
// launch path. The scaffold below works end-to-end except for the PTY
// `spawn` itself:
//
//   - ChromeDriver connects to Obsidian (session established).
//   - `plugins: [{ path: "..", enabled: false }]` installs the plugin.
//   - `stageNativesAndEnable()` drops `pty-<platform>-<arch>.node` and
//     `spawn-helper-<platform>-<arch>` into the installed plugin dir with
//     755 mode, then flips the plugin on.
//   - `browser.executeObsidianCommand('obsidian-shell:run-self-test')`
//     dispatches cleanly and the Notice DOM element renders with text.
//
// The `nodePty.spawn()` call inside `probePty` fails with the catch-all
// `posix_spawnp failed.` error from node-pty's POSIX backend. The same
// binary execs cleanly via `child_process.execFileSync` from the same
// renderer, `/dev/ptmx` opens, and `/usr/bin/uname` exists. Something about
// the PTY allocation or `spawn` step itself fails in ChromeDriver's launch
// context. The same plugin works in a normal double-click launch of the
// same Obsidian binary (auto-opens a shell tab).
//
// Next moves when picking this back up:
//   1. File an issue on wdio-obsidian-service documenting the symptom.
//   2. Build a locally patched node-pty that surfaces the actual errno
//      from `pty_posix_spawn` so the failing step becomes visible.
//   3. Potentially override the `--test-type=webdriver` flag or whatever
//      ChromeDriver adds that restricts `posix_spawn`.
//
// Every other part of the harness works. Swap `describe.skip`
// back to `describe` and it should pass once the underlying blocker lifts.
describe.skip('obsidian-shell plugin loads end-to-end', () => {
  before(async () => {
    await browser.reloadObsidian();
    await stageNativesAndEnable();
  });

  it('Shell: Run self-test returns platform info in a Notice', async () => {
    await browser.executeObsidianCommand('obsidian-shell:run-self-test');

    let captured = '';
    await browser.waitUntil(
      async () => {
        const notices = await browser.$$('.notice');
        for (const notice of notices) {
          const text = (await notice.getText()) ?? '';
          if (text.includes('Self-test')) {
            captured = text;
            return true;
          }
        }
        return false;
      },
      {
        timeout: 15000,
        timeoutMsg: 'no notice with "Self-test" text appeared within 15s',
      },
    );
    expect(captured).toMatch(/Self-test:\s+(Darwin|Linux|Windows)/);
  });
});
