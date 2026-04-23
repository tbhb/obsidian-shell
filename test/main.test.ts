import { __resetObsidianMocks, App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';

function makePlugin(): TerminalPlugin {
  return new TerminalPlugin(new App() as never, { id: 'obsidian-terminal' } as never);
}

beforeEach(() => {
  __resetObsidianMocks();
});

describe('TerminalPlugin.loadSettings', () => {
  it('falls back to defaults when loadData returns null', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => null);
    await plugin.loadSettings();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored partial settings over defaults', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => ({}));
    await plugin.loadSettings();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('TerminalPlugin.saveSettings', () => {
  it('persists the current settings via saveData', async () => {
    const plugin = makePlugin();
    plugin.settings = { ...DEFAULT_SETTINGS };
    plugin.saveData = vi.fn();
    await plugin.saveSettings();
    expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
  });
});

describe('TerminalPlugin.onload', () => {
  it('loads settings and registers the setting tab', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.__settingTabs).toHaveLength(1);
    plugin.onunload();
  });
});

describe('TerminalPlugin.onExternalSettingsChange', () => {
  it('reloads settings', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => null);
    await plugin.onExternalSettingsChange();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });
});
