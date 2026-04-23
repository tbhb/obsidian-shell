import {
  __getSettings,
  __resetObsidianMocks,
  App,
  type DropdownComponent,
  type Setting,
  type SliderComponent,
  type TextComponent,
  type ToggleComponent,
} from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShellPlugin from '../src/main';
import {
  DEFAULT_SETTINGS,
  detectMonospaceFonts,
  mergeSettings,
  ShellSettingTab,
} from '../src/settings';

vi.mock('../src/view', () => ({
  SHELL_VIEW_TYPE: 'obsidian-shell',
  ShellView: class {
    constructor(
      public leaf: unknown,
      public plugin: unknown,
    ) {}
    applySettings(): void {}
  },
}));

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

  it('merges partial shell settings', () => {
    const merged = mergeSettings({ shell: { path: '/bin/bash' } });
    expect(merged.shell.path).toBe('/bin/bash');
    expect(merged.shell.args).toEqual(DEFAULT_SETTINGS.shell.args);
  });

  it('merges partial cwd settings', () => {
    const merged = mergeSettings({ cwd: { strategy: 'note-dir' } });
    expect(merged.cwd.strategy).toBe('note-dir');
    expect(merged.cwd.fixedPath).toBe(DEFAULT_SETTINGS.cwd.fixedPath);
  });

  it('merges partial appearance settings', () => {
    const merged = mergeSettings({ appearance: { fontSize: 16 } });
    expect(merged.appearance.fontSize).toBe(16);
    expect(merged.appearance.cursorStyle).toBe(DEFAULT_SETTINGS.appearance.cursorStyle);
  });

  it('merges partial behavior settings', () => {
    const merged = mergeSettings({ behavior: { scrollback: 5000 } });
    expect(merged.behavior.scrollback).toBe(5000);
    expect(merged.behavior.copyOnSelection).toBe(DEFAULT_SETTINGS.behavior.copyOnSelection);
  });

  it('does not mutate DEFAULT_SETTINGS', () => {
    const before = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    mergeSettings({ appearance: { fontSize: 20 } });
    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});

describe('detectMonospaceFonts', () => {
  it('returns an empty array when FontFaceSet is undefined', () => {
    expect(detectMonospaceFonts(undefined)).toEqual([]);
  });

  it('returns an empty array when FontFaceSet is null', () => {
    expect(detectMonospaceFonts(null)).toEqual([]);
  });

  it('returns an empty array when check is missing', () => {
    const fake = {} as unknown as FontFaceSet;
    expect(detectMonospaceFonts(fake)).toEqual([]);
  });

  it('returns fonts for which check returns true', () => {
    const accept = new Set(['Menlo', 'Monaco']);
    const fake = {
      check: vi.fn((spec: string) => Array.from(accept).some((f) => spec.includes(`"${f}"`))),
    } as unknown as FontFaceSet;
    expect(detectMonospaceFonts(fake)).toEqual(['Menlo', 'Monaco']);
  });
});

describe('ShellSettingTab.display', () => {
  let plugin: ShellPlugin;
  let tab: ShellSettingTab;

  beforeEach(() => {
    __resetObsidianMocks();
    plugin = new ShellPlugin(new App() as never, { id: 'obsidian-shell' } as never);
    plugin.settings = structuredClone(DEFAULT_SETTINGS);
    plugin.saveData = vi.fn();
    tab = new ShellSettingTab(plugin.app, plugin);
  });

  function currentSettings(): Setting[] {
    // __getSettings() accumulates across display() calls. Filter to the rows
    // whose settingEl is still attached to this tab's containerEl.
    return __getSettings().filter((s) => tab.containerEl.contains(s.settingEl));
  }

  function findSetting(name: string): Setting {
    const match = currentSettings().find((s) => s.name === name);
    if (!match) {
      throw new Error(`no Setting row named ${name}`);
    }
    return match;
  }

  function stubDocumentFonts(check: (spec: string) => boolean): void {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { check },
    });
  }

  it('renders the section headings', () => {
    tab.display();
    const headings = currentSettings().filter((s) => s.heading);
    expect(headings.map((h) => h.name)).toEqual([
      'Executable',
      'Working directory',
      'Appearance',
      'Behavior',
    ]);
  });

  it('clears and re-renders on repeated display calls', () => {
    tab.display();
    const afterFirst = tab.containerEl.childElementCount;
    tab.display();
    expect(tab.containerEl.childElementCount).toBe(afterFirst);
  });

  it('shell path onChange persists the trimmed value', async () => {
    tab.display();
    const text = findSetting('Shell path').components[0] as TextComponent;
    await text.__trigger('  /bin/bash  ');
    expect(plugin.settings.shell.path).toBe('/bin/bash');
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('shell arguments onChange splits on whitespace', async () => {
    tab.display();
    const text = findSetting('Shell arguments').components[0] as TextComponent;
    await text.__trigger('-l -i');
    expect(plugin.settings.shell.args).toEqual(['-l', '-i']);
  });

  it('shell arguments onChange produces an empty array for blank input', async () => {
    tab.display();
    const text = findSetting('Shell arguments').components[0] as TextComponent;
    await text.__trigger('   ');
    expect(plugin.settings.shell.args).toEqual([]);
  });

  it('cwd strategy onChange updates settings and re-renders', async () => {
    tab.display();
    const dropdown = findSetting('Starting directory').components[0] as DropdownComponent;
    const displaySpy = vi.spyOn(tab, 'display');
    await dropdown.__trigger('fixed-path');
    expect(plugin.settings.cwd.strategy).toBe('fixed-path');
    expect(displaySpy).toHaveBeenCalled();
  });

  it('custom path row appears only when strategy is fixed-path', () => {
    plugin.settings.cwd.strategy = 'vault-root';
    tab.display();
    expect(currentSettings().some((s) => s.name === 'Custom path')).toBe(false);

    plugin.settings.cwd.strategy = 'fixed-path';
    tab.display();
    expect(currentSettings().some((s) => s.name === 'Custom path')).toBe(true);
  });

  it('custom path onChange persists the trimmed value', async () => {
    plugin.settings.cwd.strategy = 'fixed-path';
    tab.display();
    const text = findSetting('Custom path').components[0] as TextComponent;
    await text.__trigger('  /Users/you/work  ');
    expect(plugin.settings.cwd.fixedPath).toBe('/Users/you/work');
  });

  it('font family dropdown picks a detected font', async () => {
    stubDocumentFonts((spec) => spec.includes('"Menlo"'));
    tab.display();
    const dropdown = findSetting('Font family').components[0] as DropdownComponent;
    await dropdown.__trigger('Menlo');
    expect(plugin.settings.appearance.fontFamily).toBe('Menlo');
    expect(currentSettings().some((s) => s.name === 'Custom font family')).toBe(false);
  });

  it('font family dropdown Custom option reveals the custom text row', async () => {
    stubDocumentFonts(() => false);
    tab.display();
    const dropdown = findSetting('Font family').components[0] as DropdownComponent;
    await dropdown.__trigger('__custom__');
    expect(currentSettings().some((s) => s.name === 'Custom font family')).toBe(true);
  });

  it('font family dropdown Default resets fontFamily and hides the custom row', async () => {
    plugin.settings.appearance.fontFamily = 'Iosevka Term';
    tab.display();
    expect(currentSettings().some((s) => s.name === 'Custom font family')).toBe(true);
    const dropdown = findSetting('Font family').components[0] as DropdownComponent;
    await dropdown.__trigger('');
    expect(plugin.settings.appearance.fontFamily).toBe('');
    expect(currentSettings().some((s) => s.name === 'Custom font family')).toBe(false);
  });

  it('custom font family text input persists arbitrary values', async () => {
    plugin.settings.appearance.fontFamily = 'Some Custom Font';
    tab.display();
    const text = findSetting('Custom font family').components[0] as TextComponent;
    await text.__trigger('Iosevka Term, monospace');
    expect(plugin.settings.appearance.fontFamily).toBe('Iosevka Term, monospace');
  });

  it('font size slider persists', async () => {
    tab.display();
    const slider = findSetting('Font size').components[0] as SliderComponent;
    await slider.__trigger(16);
    expect(plugin.settings.appearance.fontSize).toBe(16);
  });

  it('line height slider persists', async () => {
    tab.display();
    const slider = findSetting('Line height').components[0] as SliderComponent;
    await slider.__trigger(1.4);
    expect(plugin.settings.appearance.lineHeight).toBe(1.4);
  });

  it('cursor style dropdown persists', async () => {
    tab.display();
    const dropdown = findSetting('Cursor style').components[0] as DropdownComponent;
    await dropdown.__trigger('bar');
    expect(plugin.settings.appearance.cursorStyle).toBe('bar');
  });

  it('cursor blink toggle persists', async () => {
    tab.display();
    const toggle = findSetting('Cursor blink').components[0] as ToggleComponent;
    await toggle.__trigger(false);
    expect(plugin.settings.appearance.cursorBlink).toBe(false);
  });

  it('follow obsidian theme toggle persists', async () => {
    tab.display();
    const toggle = findSetting('Follow Obsidian theme').components[0] as ToggleComponent;
    await toggle.__trigger(false);
    expect(plugin.settings.appearance.followObsidianTheme).toBe(false);
  });

  it('scrollback slider persists', async () => {
    tab.display();
    const slider = findSetting('Scrollback lines').components[0] as SliderComponent;
    await slider.__trigger(5000);
    expect(plugin.settings.behavior.scrollback).toBe(5000);
  });

  it('copy on select toggle persists', async () => {
    tab.display();
    const toggle = findSetting('Copy on select').components[0] as ToggleComponent;
    await toggle.__trigger(true);
    expect(plugin.settings.behavior.copyOnSelection).toBe(true);
  });
});
