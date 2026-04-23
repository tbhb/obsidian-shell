import { __getNotices, __resetObsidianMocks, App, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPlugin from '../src/main';
import { PtySession, probePty } from '../src/pty';
import { DEFAULT_SETTINGS } from '../src/settings';
import { TERMINAL_VIEW_TYPE, TerminalView } from '../src/view';

vi.mock('../src/pty', () => {
  const ctor = vi.fn(function ctorImpl(this: Record<string, unknown>) {
    this.isDead = false;
    this.kill = vi.fn(() => {
      this.isDead = true;
    });
    this.resize = vi.fn();
    this.attach = vi.fn();
    this.detach = vi.fn();
    this.write = vi.fn();
  });
  return {
    probePty: vi.fn(),
    PtySession: ctor,
  };
});

// The real src/view.ts pulls in @xterm/xterm, which touches the DOM at
// construction time. Tests only need the module symbols; mock them.
vi.mock('../src/view', () => ({
  TERMINAL_VIEW_TYPE: 'obsidian-terminal',
  TerminalView: class {
    constructor(
      public leaf: unknown,
      public plugin: unknown,
    ) {}
    applySettings = vi.fn();
    reattachSession = vi.fn();
  },
}));

const mockedProbePty = vi.mocked(probePty);
const mockedPtySession = vi.mocked(PtySession);

interface FakeSession {
  isDead: boolean;
  kill: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

function lastSession(): FakeSession {
  const { instances } = mockedPtySession.mock;
  const last = instances.at(-1);
  if (!last) {
    throw new Error('no PtySession was constructed');
  }
  return last as unknown as FakeSession;
}

function makePlugin(): TerminalPlugin {
  const plugin = new TerminalPlugin(new App() as never, { id: 'obsidian-terminal' } as never);
  plugin.settings = structuredClone(DEFAULT_SETTINGS);
  return plugin;
}

beforeEach(() => {
  __resetObsidianMocks();
  mockedProbePty.mockReset();
  mockedPtySession.mockClear();
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
  it('persists the current settings via saveData and refreshes open views', async () => {
    const plugin = makePlugin();
    plugin.saveData = vi.fn();
    const refreshSpy = vi.spyOn(plugin, 'refreshOpenViews');
    await plugin.saveSettings();
    expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    expect(refreshSpy).toHaveBeenCalled();
  });
});

describe('TerminalPlugin.resolveCwd', () => {
  it('returns the vault base path for vault-root', () => {
    const plugin = makePlugin();
    plugin.settings.cwd.strategy = 'vault-root';
    expect(plugin.resolveCwd()).toBe('/mock/vault');
  });

  it('returns the fixed path when set', () => {
    const plugin = makePlugin();
    plugin.settings.cwd = { strategy: 'fixed-path', fixedPath: '/Users/you/work' };
    expect(plugin.resolveCwd()).toBe('/Users/you/work');
  });

  it('falls back to vault base for fixed-path with empty fixedPath', () => {
    const plugin = makePlugin();
    plugin.settings.cwd = { strategy: 'fixed-path', fixedPath: '' };
    expect(plugin.resolveCwd()).toBe('/mock/vault');
  });

  it("returns the active note's folder for note-dir", () => {
    const plugin = makePlugin();
    plugin.settings.cwd.strategy = 'note-dir';
    const folder = new TFolder();
    folder.path = 'notes';
    const file = new TFile();
    file.parent = folder;
    vi.spyOn(plugin.app.workspace, 'getActiveFile').mockReturnValue(file);
    expect(plugin.resolveCwd()).toBe('/mock/vault/notes');
  });

  it('falls back to vault base for note-dir when no active file', () => {
    const plugin = makePlugin();
    plugin.settings.cwd.strategy = 'note-dir';
    vi.spyOn(plugin.app.workspace, 'getActiveFile').mockReturnValue(null);
    expect(plugin.resolveCwd()).toBe('/mock/vault');
  });

  it('falls back to vault base for note-dir when the active file has no parent', () => {
    const plugin = makePlugin();
    plugin.settings.cwd.strategy = 'note-dir';
    const file = new TFile();
    file.parent = null;
    vi.spyOn(plugin.app.workspace, 'getActiveFile').mockReturnValue(file);
    expect(plugin.resolveCwd()).toBe('/mock/vault');
  });
});

describe('TerminalPlugin.refreshOpenViews', () => {
  it('applies settings to every matching TerminalView leaf', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    plugin.refreshOpenViews();
    expect(view.applySettings).toHaveBeenCalledWith(plugin.settings);
  });

  it('ignores foreign views on the terminal leaf type', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    leaf.view = { render: vi.fn() };
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(() => plugin.refreshOpenViews()).not.toThrow();
  });
});

describe('TerminalPlugin.getOrCreateSession', () => {
  it('constructs a fresh PtySession the first time it is called', () => {
    const plugin = makePlugin();
    const session = plugin.getOrCreateSession(100, 30);
    expect(mockedPtySession).toHaveBeenCalledTimes(1);
    const [, options] = mockedPtySession.mock.calls[0] ?? [];
    expect(options).toMatchObject({ cols: 100, rows: 30 });
    expect(session).toBe(lastSession());
  });

  it('reuses an alive session and just resizes it', () => {
    const plugin = makePlugin();
    const first = plugin.getOrCreateSession(80, 24);
    const second = plugin.getOrCreateSession(120, 40);
    expect(mockedPtySession).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(lastSession().resize).toHaveBeenCalledWith(120, 40);
  });

  it('spawns a new session when the previous one is dead', () => {
    const plugin = makePlugin();
    const first = plugin.getOrCreateSession(80, 24) as unknown as FakeSession;
    first.isDead = true;
    const second = plugin.getOrCreateSession(80, 24);
    expect(mockedPtySession).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('passes shell overrides from settings through to the session', () => {
    const plugin = makePlugin();
    plugin.settings.shell.path = '/bin/bash';
    plugin.settings.shell.args = ['-i'];
    plugin.getOrCreateSession(80, 24);
    const [, options] = mockedPtySession.mock.calls[0] ?? [];
    expect(options).toMatchObject({ shell: '/bin/bash', shellArgs: ['-i'] });
  });

  it('omits shell overrides when the settings are empty', () => {
    const plugin = makePlugin();
    plugin.settings.shell = { path: '', args: [] };
    plugin.getOrCreateSession(80, 24);
    const [, options] = mockedPtySession.mock.calls[0] ?? [];
    expect(options).toMatchObject({ shell: undefined, shellArgs: undefined });
  });
});

describe('TerminalPlugin.restartSession', () => {
  it('kills the current session and tells open views to reattach', () => {
    const plugin = makePlugin();
    plugin.getOrCreateSession(80, 24);
    const killed = lastSession();
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);

    plugin.restartSession();

    expect(killed.kill).toHaveBeenCalled();
    expect(view.reattachSession).toHaveBeenCalled();
  });

  it('is safe when no session is running', () => {
    const plugin = makePlugin();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    expect(() => plugin.restartSession()).not.toThrow();
  });

  it('ignores foreign views when restarting', () => {
    const plugin = makePlugin();
    plugin.getOrCreateSession(80, 24);
    const leaf = new WorkspaceLeaf();
    leaf.view = { render: vi.fn() };
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(() => plugin.restartSession()).not.toThrow();
  });
});

describe('TerminalPlugin.onunload', () => {
  it('kills the running session', () => {
    const plugin = makePlugin();
    plugin.getOrCreateSession(80, 24);
    const session = lastSession();
    plugin.onunload();
    expect(session.kill).toHaveBeenCalled();
  });

  it('is safe when no session is running', () => {
    const plugin = makePlugin();
    expect(() => plugin.onunload()).not.toThrow();
  });
});

describe('restart-shell command', () => {
  it('invokes restartSession', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'restartSession').mockReturnValue();
    const cmd = plugin.__findCommand('restart-shell');
    cmd?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });
});

describe('TerminalPlugin.onload', () => {
  it('registers the setting tab, the terminal view, and every command', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.__settingTabs).toHaveLength(1);
    expect(plugin.__viewFactories.has(TERMINAL_VIEW_TYPE)).toBe(true);
    expect(plugin.__findCommand('open-shell')).toBeDefined();
    expect(plugin.__findCommand('restart-shell')).toBeDefined();
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
  it('reloads settings and refreshes open views', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => null);
    const refreshSpy = vi.spyOn(plugin, 'refreshOpenViews');
    await plugin.onExternalSettingsChange();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(refreshSpy).toHaveBeenCalled();
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
