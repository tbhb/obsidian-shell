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
    attachToSession = vi.fn();
    getSessionId = vi.fn(() => null as string | null);
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

describe('TerminalPlugin.createSession', () => {
  it('constructs a PtySession with sequential shell-N ids and Shell N labels', () => {
    const plugin = makePlugin();
    const first = plugin.createSession(100, 30);
    const second = plugin.createSession(80, 24);
    expect(first.id).toBe('shell-1');
    expect(first.label).toBe('Shell 1');
    expect(second.id).toBe('shell-2');
    expect(second.label).toBe('Shell 2');
    expect(mockedPtySession).toHaveBeenCalledTimes(2);
  });

  it('passes shell overrides from settings through to the session', () => {
    const plugin = makePlugin();
    plugin.settings.shell.path = '/bin/bash';
    plugin.settings.shell.args = ['-i'];
    plugin.createSession(80, 24);
    const [, options] = mockedPtySession.mock.calls[0] ?? [];
    expect(options).toMatchObject({ shell: '/bin/bash', shellArgs: ['-i'] });
  });

  it('omits shell overrides when the settings are empty', () => {
    const plugin = makePlugin();
    plugin.settings.shell = { path: '', args: [] };
    plugin.createSession(80, 24);
    const [, options] = mockedPtySession.mock.calls[0] ?? [];
    expect(options).toMatchObject({ shell: undefined, shellArgs: undefined });
  });
});

describe('TerminalPlugin.getSession', () => {
  it('returns the entry when the session is alive', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    expect(plugin.getSession(entry.id)).toBe(entry);
  });

  it('returns null when the id is unknown', () => {
    const plugin = makePlugin();
    expect(plugin.getSession('shell-99')).toBeNull();
  });

  it('returns the entry even when the session is dead', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    (entry.session as unknown as FakeSession).isDead = true;
    expect(plugin.getSession(entry.id)).toBe(entry);
  });
});

describe('TerminalPlugin.listSessions', () => {
  it('returns an empty array when no sessions have been created', () => {
    const plugin = makePlugin();
    expect(plugin.listSessions()).toEqual([]);
  });

  it('returns every tracked session in creation order', () => {
    const plugin = makePlugin();
    const a = plugin.createSession(80, 24);
    const b = plugin.createSession(80, 24);
    expect(plugin.listSessions()).toEqual([a, b]);
  });
});

describe('TerminalPlugin.isSessionAttached', () => {
  it('returns true when a TerminalView leaf hosts the given id', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(true);
  });

  it('returns false when a leaf hosts a different session', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue('shell-99');
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(false);
  });

  it('ignores leaves whose view is not a TerminalView', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    leaf.view = { render: vi.fn() };
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(false);
  });
});

describe('TerminalPlugin.describeSessionState', () => {
  it('returns exited when the session is dead', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    (entry.session as unknown as FakeSession).isDead = true;
    expect(plugin.describeSessionState(entry)).toBe('exited');
  });

  it('returns attached when a TerminalView leaf hosts the session', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.describeSessionState(entry)).toBe('attached');
  });

  it('returns detached when the session is alive but nothing hosts it', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    expect(plugin.describeSessionState(entry)).toBe('detached');
  });
});

describe('TerminalPlugin.openShellPicker', () => {
  it('opens a ShellPickerModal instance', () => {
    const plugin = makePlugin();
    expect(() => plugin.openShellPicker()).not.toThrow();
  });
});

describe('TerminalPlugin.switchToSession', () => {
  it('shows a notice when the id is unknown', async () => {
    const plugin = makePlugin();
    await plugin.switchToSession('shell-99');
    expect(__getNotices().at(-1)?.message).toBe('Shell not found.');
  });

  it('reveals the existing leaf when another view already hosts the session', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.switchToSession(entry.id);
    expect(reveal).toHaveBeenCalledWith(leaf);
  });

  it('attaches the active TerminalView to the chosen session when no other leaf hosts it', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const activeLeaf = new WorkspaceLeaf();
    const activeView = new TerminalView(activeLeaf as never, plugin as never);
    activeView.getSessionId = vi.fn().mockReturnValue('shell-99');
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(activeView);
    await plugin.switchToSession(entry.id);
    expect(activeView.attachToSession).toHaveBeenCalledWith(entry.id);
  });

  it('ignores existing leaves that host a different session or non-terminal view', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const otherLeaf = new WorkspaceLeaf();
    const otherView = new TerminalView(otherLeaf as never, plugin as never);
    otherView.getSessionId = vi.fn().mockReturnValue('shell-99');
    otherLeaf.view = otherView;
    const foreignLeaf = new WorkspaceLeaf();
    foreignLeaf.view = { render: vi.fn() };
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([otherLeaf, foreignLeaf]);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(null);
    const leaf = new WorkspaceLeaf();
    vi.spyOn(plugin.app.workspace, 'getLeaf').mockReturnValue(leaf);
    await plugin.switchToSession(entry.id);
    expect(leaf.setViewState).toHaveBeenCalled();
  });

  it('opens a new leaf attached to the session when there is no active terminal view', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(null);
    const leaf = new WorkspaceLeaf();
    const getLeafSpy = vi.spyOn(plugin.app.workspace, 'getLeaf').mockReturnValue(leaf);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.switchToSession(entry.id);
    expect(getLeafSpy).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: TERMINAL_VIEW_TYPE,
      active: true,
      state: { sessionId: entry.id },
    });
    expect(reveal).toHaveBeenCalledWith(leaf);
  });
});

describe('TerminalPlugin.killSession', () => {
  it('kills the session and drops it from the map', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const session = entry.session as unknown as FakeSession;
    plugin.killSession(entry.id);
    expect(session.kill).toHaveBeenCalled();
    expect(plugin.getSession(entry.id)).toBeNull();
  });

  it('is a no-op on unknown ids', () => {
    const plugin = makePlugin();
    expect(() => plugin.killSession('shell-99')).not.toThrow();
  });
});

describe('TerminalPlugin.killAllSessions', () => {
  it('kills every tracked session and clears the map', () => {
    const plugin = makePlugin();
    const a = plugin.createSession(80, 24);
    const b = plugin.createSession(80, 24);
    plugin.killAllSessions();
    expect((a.session as unknown as FakeSession).kill).toHaveBeenCalled();
    expect((b.session as unknown as FakeSession).kill).toHaveBeenCalled();
    expect(plugin.getSession(a.id)).toBeNull();
    expect(plugin.getSession(b.id)).toBeNull();
  });

  it('is a no-op when no sessions exist', () => {
    const plugin = makePlugin();
    expect(() => plugin.killAllSessions()).not.toThrow();
  });
});

describe('TerminalPlugin.newShell', () => {
  it('creates a new tab leaf and opens a terminal view in it', async () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const getLeafSpy = vi.spyOn(plugin.app.workspace, 'getLeaf').mockReturnValue(leaf);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.newShell();
    expect(getLeafSpy).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: TERMINAL_VIEW_TYPE, active: true });
    expect(reveal).toHaveBeenCalledWith(leaf);
  });
});

describe('TerminalPlugin.killActiveShell', () => {
  it('kills the active shell when a terminal view is focused', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(view);
    plugin.killActiveShell();
    expect((entry.session as unknown as FakeSession).kill).toHaveBeenCalled();
  });

  it('shows a notice when there is no active shell', () => {
    const plugin = makePlugin();
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(null);
    plugin.killActiveShell();
    expect(__getNotices().at(-1)?.message).toBe('No active shell to kill.');
  });

  it('does nothing when the active view has no session id', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(null);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(view);
    expect(() => plugin.killActiveShell()).not.toThrow();
  });
});

describe('TerminalPlugin.restartActiveShell', () => {
  it('tells the active view to reattach', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new TerminalView(leaf as never, plugin as never);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(view);
    plugin.restartActiveShell();
    expect(view.reattachSession).toHaveBeenCalled();
  });

  it('shows a notice when there is no active shell', () => {
    const plugin = makePlugin();
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(null);
    plugin.restartActiveShell();
    expect(__getNotices().at(-1)?.message).toBe('No active shell to restart.');
  });
});

describe('TerminalPlugin.onunload', () => {
  it('kills every session', () => {
    const plugin = makePlugin();
    const a = plugin.createSession(80, 24);
    const b = plugin.createSession(80, 24);
    plugin.onunload();
    expect((a.session as unknown as FakeSession).kill).toHaveBeenCalled();
    expect((b.session as unknown as FakeSession).kill).toHaveBeenCalled();
  });

  it('is safe when no sessions exist', () => {
    const plugin = makePlugin();
    expect(() => plugin.onunload()).not.toThrow();
  });
});

describe('TerminalPlugin.onload', () => {
  it('registers the setting tab, the terminal view, and every command', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.__settingTabs).toHaveLength(1);
    expect(plugin.__viewFactories.has(TERMINAL_VIEW_TYPE)).toBe(true);
    expect(plugin.__findCommand('open-shell')).toBeDefined();
    expect(plugin.__findCommand('new-shell')).toBeDefined();
    expect(plugin.__findCommand('kill-shell')).toBeDefined();
    expect(plugin.__findCommand('restart-shell')).toBeDefined();
    expect(plugin.__findCommand('kill-all-shells')).toBeDefined();
    expect(plugin.__findCommand('switch-shell')).toBeDefined();
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

describe('shell commands wiring', () => {
  it('open-shell calls activateView', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'activateView').mockResolvedValue();
    await plugin.__findCommand('open-shell')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('new-shell calls newShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'newShell').mockResolvedValue();
    await plugin.__findCommand('new-shell')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('kill-shell calls killActiveShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'killActiveShell').mockReturnValue();
    plugin.__findCommand('kill-shell')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('restart-shell calls restartActiveShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'restartActiveShell').mockReturnValue();
    plugin.__findCommand('restart-shell')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('kill-all-shells calls killAllSessions', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'killAllSessions').mockReturnValue();
    plugin.__findCommand('kill-all-shells')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('switch-shell calls openShellPicker', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'openShellPicker').mockReturnValue();
    plugin.__findCommand('switch-shell')?.callback?.();
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
