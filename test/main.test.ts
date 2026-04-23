import { __getNotices, __resetObsidianMocks, App, WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPlugin from '../src/main';
import { probePty } from '../src/pty';
import { DEFAULT_SETTINGS } from '../src/settings';
import { TERMINAL_VIEW_TYPE } from '../src/view';

vi.mock('../src/pty', () => ({
  probePty: vi.fn(),
}));

// The real src/view.ts pulls in @xterm/xterm, which touches the DOM at
// construction time. Tests only need the module symbols; mock them.
vi.mock('../src/view', () => ({
  TERMINAL_VIEW_TYPE: 'obsidian-terminal',
  TerminalView: class {
    constructor(
      public leaf: unknown,
      public plugin: unknown,
    ) {}
  },
}));

const mockedProbePty = vi.mocked(probePty);

function makePlugin(): TerminalPlugin {
  return new TerminalPlugin(new App() as never, { id: 'obsidian-terminal' } as never);
}

beforeEach(() => {
  __resetObsidianMocks();
  mockedProbePty.mockReset();
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
  it('registers the setting tab, the terminal view, and the open-shell and self-test commands', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.__settingTabs).toHaveLength(1);
    expect(plugin.__viewFactories.has(TERMINAL_VIEW_TYPE)).toBe(true);
    expect(plugin.__findCommand('open-shell')).toBeDefined();
    expect(plugin.__findCommand('run-self-test')).toBeDefined();
    plugin.onunload();
  });

  it('constructs a TerminalView through the registered factory', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const factory = plugin.__viewFactories.get(TERMINAL_VIEW_TYPE);
    expect(factory).toBeDefined();
    const leaf = new WorkspaceLeaf();
    expect(() => factory?.(leaf)).not.toThrow();
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

describe('TerminalPlugin.activateView', () => {
  it('reveals the existing leaf when one is already open', async () => {
    const plugin = makePlugin();
    const existing = new WorkspaceLeaf();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([existing]);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.activateView();
    expect(reveal).toHaveBeenCalledWith(existing);
  });

  it('creates a new right leaf when none exists', async () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getRightLeaf').mockReturnValue(leaf);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.activateView();
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: TERMINAL_VIEW_TYPE,
      active: true,
    });
    expect(reveal).toHaveBeenCalledWith(leaf);
  });

  it('bails out when getRightLeaf returns null', async () => {
    const plugin = makePlugin();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getRightLeaf').mockReturnValue(null);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.activateView();
    expect(reveal).not.toHaveBeenCalled();
  });
});

describe('TerminalPlugin.onUserEnable', () => {
  it('activates the view', () => {
    const plugin = makePlugin();
    const spy = vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    plugin.onUserEnable();
    expect(spy).toHaveBeenCalledWith(TERMINAL_VIEW_TYPE);
  });
});

describe('open-shell command', () => {
  it('activates the view through the registered callback', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'activateView').mockResolvedValue();
    const cmd = plugin.__findCommand('open-shell');
    await cmd?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });
});

describe('run-self-test command', () => {
  it('shows a success notice when probePty resolves', async () => {
    mockedProbePty.mockResolvedValue('Darwin 25.4.0 arm64');
    const plugin = makePlugin();
    await plugin.onload();
    const cmd = plugin.__findCommand('run-self-test');
    await cmd?.callback?.();
    const last = __getNotices().at(-1);
    expect(last?.message).toBe('Self-test: Darwin 25.4.0 arm64');
  });

  it('shows the error message when probePty rejects with an Error', async () => {
    mockedProbePty.mockRejectedValue(new Error('native binary missing'));
    const plugin = makePlugin();
    await plugin.onload();
    const cmd = plugin.__findCommand('run-self-test');
    await cmd?.callback?.();
    const last = __getNotices().at(-1);
    expect(last?.message).toBe('Self-test failed: native binary missing');
  });

  it('stringifies non-Error rejections', async () => {
    mockedProbePty.mockRejectedValue('string rejection');
    const plugin = makePlugin();
    await plugin.onload();
    const cmd = plugin.__findCommand('run-self-test');
    await cmd?.callback?.();
    const last = __getNotices().at(-1);
    expect(last?.message).toBe('Self-test failed: string rejection');
  });
});
