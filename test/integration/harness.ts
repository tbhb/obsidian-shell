import { App, createFilesystemVault, type PluginManifest } from 'obsidian';
import { afterEach, beforeEach } from 'vitest';

import type ShellPlugin from '../../src/main';
import { copyFixtureToTmp, type VaultFixture } from './fixture';

const MANIFEST: PluginManifest = {
  id: 'shell',
  name: 'Shell',
  version: '0.0.0-test',
  minAppVersion: '1.7.2',
};

export const DATA_JSON = '.obsidian/plugins/shell/data.json';

type ShellPluginCtor = new (app: never, manifest: never) => ShellPlugin;

export function buildPlugin(Ctor: ShellPluginCtor, vaultPath: string): ShellPlugin {
  const app = new App();
  app.vault = createFilesystemVault(vaultPath) as unknown as typeof app.vault;
  return new Ctor(app as never, MANIFEST as never);
}

interface PluginFixtureContext {
  fixture: VaultFixture;
  plugin: ShellPlugin;
}

// Registers beforeEach/afterEach that copy the fixture to a tmpdir, build a
// ShellPlugin, and run `onload`. Returns a context the caller reads inside
// `it` blocks.
export function useFixturePlugin(getCtor: () => ShellPluginCtor): PluginFixtureContext {
  const ctx = {} as PluginFixtureContext;
  beforeEach(async () => {
    ctx.fixture = copyFixtureToTmp();
    ctx.plugin = buildPlugin(getCtor(), ctx.fixture.path);
    await ctx.plugin.onload();
  });
  afterEach(() => {
    ctx.plugin.onunload();
    ctx.fixture.cleanup();
  });
  return ctx;
}
