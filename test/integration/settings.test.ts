import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import ShellPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { buildPlugin, DATA_JSON, useFixturePlugin } from './harness';

describe('settings roundtrip against a vault fixture', () => {
  const ctx = useFixturePlugin(() => ShellPlugin);

  it('reads fixture data.json into plugin.settings on load', () => {
    expect(ctx.plugin.settings.appearance.fontSize).toBe(16);
    expect(ctx.plugin.settings.shell.args).toEqual(['-l', '-i']);
    expect(ctx.plugin.settings.behavior.scrollback).toBe(5000);
    expect(ctx.plugin.settings.cwd.strategy).toBe('vault-root');
    expect(ctx.plugin.settings.appearance.cursorStyle).toBe(
      DEFAULT_SETTINGS.appearance.cursorStyle,
    );
    expect(ctx.plugin.settings.cwd.fixedPath).toBe(DEFAULT_SETTINGS.cwd.fixedPath);
    expect(ctx.plugin.settings.behavior.copyOnSelection).toBe(
      DEFAULT_SETTINGS.behavior.copyOnSelection,
    );
  });

  it('persists saveSettings to disk and a fresh plugin reads the changes', async () => {
    ctx.plugin.settings.appearance.fontSize = 20;
    ctx.plugin.settings.behavior.scrollback = 9000;
    await ctx.plugin.saveSettings();

    const onDisk = JSON.parse(readFileSync(join(ctx.fixture.path, DATA_JSON), 'utf8')) as {
      appearance: { fontSize: number };
      behavior: { scrollback: number };
    };
    expect(onDisk.appearance.fontSize).toBe(20);
    expect(onDisk.behavior.scrollback).toBe(9000);

    const reloaded = buildPlugin(ShellPlugin, ctx.fixture.path);
    await reloaded.onload();
    try {
      expect(reloaded.settings.appearance.fontSize).toBe(20);
      expect(reloaded.settings.behavior.scrollback).toBe(9000);
    } finally {
      reloaded.onunload();
    }
  });

  it('picks up external edits via onExternalSettingsChange', async () => {
    const next = {
      shell: { args: ['-l'] },
      cwd: { strategy: 'fixed-path', fixedPath: '/tmp/somewhere' },
      appearance: { fontSize: 22, cursorStyle: 'bar' },
      behavior: { scrollback: 1000 },
    };
    writeFileSync(join(ctx.fixture.path, DATA_JSON), JSON.stringify(next, null, 2), 'utf8');

    await ctx.plugin.onExternalSettingsChange();

    expect(ctx.plugin.settings.appearance.fontSize).toBe(22);
    expect(ctx.plugin.settings.appearance.cursorStyle).toBe('bar');
    expect(ctx.plugin.settings.cwd.strategy).toBe('fixed-path');
    expect(ctx.plugin.settings.cwd.fixedPath).toBe('/tmp/somewhere');
    expect(ctx.plugin.app.workspace.getLeavesOfType).toHaveBeenCalledWith('obsidian-shell');
  });
});
