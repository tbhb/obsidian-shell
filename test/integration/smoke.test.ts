import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createFilesystemVault, TFile, TFolder } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyFixtureToTmp, type VaultFixture } from './fixture';

describe('integration smoke', () => {
  let fixture: VaultFixture;

  beforeEach(() => {
    fixture = copyFixtureToTmp();
  });

  afterEach(() => {
    fixture.cleanup();
    expect(existsSync(fixture.path)).toBe(false);
  });

  it('reads a fixture file through the filesystem-backed vault', async () => {
    const vault = createFilesystemVault(fixture.path);
    const file = vault.getFileByPath('Notes/hello.md');
    if (!(file instanceof TFile)) {
      throw new Error('expected Notes/hello.md to resolve to a TFile');
    }
    const content = await vault.read(file);
    expect(content).toContain('# Hello');
  });

  it('distinguishes files from folders', () => {
    const vault = createFilesystemVault(fixture.path);
    expect(vault.getFileByPath('Notes')).toBeNull();
    expect(vault.getFolderByPath('Notes')).toBeInstanceOf(TFolder);
    expect(vault.getFileByPath('Notes/hello.md')).toBeInstanceOf(TFile);
    expect(vault.getFolderByPath('Notes/hello.md')).toBeNull();
  });

  it('ships plugin manifest and data.json under .obsidian/plugins', () => {
    const pluginDir = join(fixture.path, '.obsidian/plugins/shell');
    const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8')) as {
      id: string;
    };
    const data = JSON.parse(readFileSync(join(pluginDir, 'data.json'), 'utf8')) as {
      appearance: { fontSize: number };
    };
    expect(manifest.id).toBe('shell');
    expect(data.appearance.fontSize).toBe(16);
  });
});
