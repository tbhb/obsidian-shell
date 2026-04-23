import { __resetObsidianMocks, App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPlugin from '../src/main';
import { DEFAULT_SETTINGS, mergeSettings, TerminalSettingTab } from '../src/settings';

describe('mergeSettings', () => {
  it('returns defaults when stored data is null', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when stored data is undefined', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when stored data is an empty object', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('does not mutate DEFAULT_SETTINGS', () => {
    const before = { ...DEFAULT_SETTINGS };
    mergeSettings({});
    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});

describe('TerminalSettingTab.display', () => {
  let plugin: TerminalPlugin;
  let tab: TerminalSettingTab;

  beforeEach(() => {
    __resetObsidianMocks();
    plugin = new TerminalPlugin(new App() as never, {} as never);
    plugin.settings = { ...DEFAULT_SETTINGS };
    plugin.saveData = vi.fn();
    tab = new TerminalSettingTab(plugin.app, plugin);
  });

  it('clears the container', () => {
    tab.containerEl.createEl('p', { text: 'stale content' });
    expect(tab.containerEl.childElementCount).toBe(1);
    tab.display();
    expect(tab.containerEl.childElementCount).toBe(0);
  });
});
