import { join } from 'node:path';

import { TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

import ShellPlugin from '../../src/main';
import { useFixturePlugin } from './harness';

function makeFileAt(relativePath: string): TFile {
  const file = new TFile();
  file.path = relativePath;
  const slash = relativePath.lastIndexOf('/');
  if (slash > 0) {
    const parent = new TFolder();
    parent.path = relativePath.slice(0, slash);
    file.parent = parent;
  }
  return file;
}

describe('resolveCwd against a vault fixture', () => {
  const ctx = useFixturePlugin(() => ShellPlugin);

  it('returns the vault root under the vault-root strategy', () => {
    expect(ctx.plugin.settings.cwd.strategy).toBe('vault-root');
    expect(ctx.plugin.resolveCwd()).toBe(ctx.fixture.path);
  });

  it('joins the active note folder under note-dir strategy', () => {
    ctx.plugin.settings.cwd.strategy = 'note-dir';
    ctx.plugin.app.workspace.getActiveFile = vi.fn(() => makeFileAt('Notes/hello.md'));
    expect(ctx.plugin.resolveCwd()).toBe(join(ctx.fixture.path, 'Notes'));
  });

  it('falls back to the vault root when note-dir has no active file', () => {
    ctx.plugin.settings.cwd.strategy = 'note-dir';
    ctx.plugin.app.workspace.getActiveFile = vi.fn(() => null);
    expect(ctx.plugin.resolveCwd()).toBe(ctx.fixture.path);
  });

  it('returns the configured path under fixed-path strategy', () => {
    ctx.plugin.settings.cwd.strategy = 'fixed-path';
    ctx.plugin.settings.cwd.fixedPath = '/tmp/forced';
    expect(ctx.plugin.resolveCwd()).toBe('/tmp/forced');
  });

  it('falls back to the vault root when fixed-path is empty', () => {
    ctx.plugin.settings.cwd.strategy = 'fixed-path';
    ctx.plugin.settings.cwd.fixedPath = '';
    expect(ctx.plugin.resolveCwd()).toBe(ctx.fixture.path);
  });
});
