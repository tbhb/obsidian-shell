import { __getNotices, __resetObsidianMocks, App, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShellPlugin from '../src/main';
import { PtySession, probePty } from '../src/pty';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SHELL_VIEW_TYPE, ShellView } from '../src/view';

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
    this.onExit = vi.fn();
  });
  return {
    probePty: vi.fn(),
    PtySession: ctor,
  };
});

// The real src/view.ts pulls in @xterm/xterm, which touches the DOM at
// construction time. Tests only need the module symbols; mock them.
vi.mock('../src/view', () => ({
  SHELL_VIEW_TYPE: 'obsidian-shell',
  ShellView: class {
    constructor(
      public leaf: unknown,
      public plugin: unknown,
    ) {}
    applySettings = vi.fn();
    reattachSession = vi.fn();
    attachToSession = vi.fn();
    focusTerminal = vi.fn();
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

function makePlugin(): ShellPlugin {
  const plugin = new ShellPlugin(new App() as never, { id: 'obsidian-shell' } as never);
  plugin.settings = structuredClone(DEFAULT_SETTINGS);
  return plugin;
}

beforeEach(() => {
  __resetObsidianMocks();
  mockedProbePty.mockReset();
  mockedPtySession.mockClear();
});

describe('ShellPlugin.loadSettings', () => {
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

describe('ShellPlugin.saveSettings', () => {
  it('persists the current settings via saveData and refreshes open views', async () => {
    const plugin = makePlugin();
    plugin.saveData = vi.fn();
    const refreshSpy = vi.spyOn(plugin, 'refreshOpenViews');
    await plugin.saveSettings();
    expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    expect(refreshSpy).toHaveBeenCalled();
  });
});

describe('ShellPlugin.resolveCwd', () => {
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

describe('ShellPlugin.refreshOpenViews', () => {
  it('applies settings to every matching ShellView leaf', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
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

describe('ShellPlugin.createSession', () => {
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

describe('ShellPlugin.getSession', () => {
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

describe('ShellPlugin.listSessions', () => {
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

describe('ShellPlugin.isSessionAttached', () => {
  it('returns true when a ShellView leaf hosts the given id', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(true);
  });

  it('returns false when a leaf hosts a different session', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue('shell-99');
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(false);
  });

  it('ignores leaves whose view is not a ShellView', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    leaf.view = { render: vi.fn() };
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    expect(plugin.isSessionAttached(entry.id)).toBe(false);
  });
});

describe('ShellPlugin.describeSessionState', () => {
  it('returns exited when the session is dead', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    (entry.session as unknown as FakeSession).isDead = true;
    expect(plugin.describeSessionState(entry)).toBe('exited');
  });

  it('returns attached when a ShellView leaf hosts the session', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
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

describe('ShellPlugin.activateShellsView', () => {
  it('reveals an existing shells-view leaf', async () => {
    const plugin = makePlugin();
    const existing = new WorkspaceLeaf();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([existing]);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.activateShellsView();
    expect(reveal).toHaveBeenCalledWith(existing);
  });

  it('creates a new left leaf when none exists', async () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getLeftLeaf').mockReturnValue(leaf);
    await plugin.activateShellsView();
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: 'obsidian-shell-list',
      active: true,
    });
  });

  it('bails out when getLeftLeaf returns null', async () => {
    const plugin = makePlugin();
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([]);
    vi.spyOn(plugin.app.workspace, 'getLeftLeaf').mockReturnValue(null);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.activateShellsView();
    expect(reveal).not.toHaveBeenCalled();
  });
});

describe('ShellPlugin.onSessionsChanged', () => {
  it('fires listeners when sessions are created, killed, or killed all', () => {
    const plugin = makePlugin();
    const listener = vi.fn();
    plugin.onSessionsChanged(listener);
    const entry = plugin.createSession(80, 24);
    expect(listener).toHaveBeenCalledTimes(1);
    plugin.killSession(entry.id);
    expect(listener).toHaveBeenCalledTimes(2);
    plugin.createSession(80, 24);
    plugin.killAllSessions();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('returns an unsubscribe function that stops further notifications', () => {
    const plugin = makePlugin();
    const listener = vi.fn();
    const unsub = plugin.onSessionsChanged(listener);
    unsub();
    plugin.createSession(80, 24);
    expect(listener).not.toHaveBeenCalled();
  });

  it('killAllSessions is a no-op without listeners when the map is empty', () => {
    const plugin = makePlugin();
    const listener = vi.fn();
    plugin.onSessionsChanged(listener);
    plugin.killAllSessions();
    expect(listener).not.toHaveBeenCalled();
  });

  it('wires session.onExit to notify listeners when the PTY exits', () => {
    const plugin = makePlugin();
    const listener = vi.fn();
    plugin.onSessionsChanged(listener);
    const entry = plugin.createSession(80, 24);
    const exitMock = (entry.session as unknown as { onExit: ReturnType<typeof vi.fn> }).onExit;
    expect(exitMock).toHaveBeenCalled();
    const [exitCb] = exitMock.mock.calls[0] ?? [];
    listener.mockClear();
    exitCb?.();
    expect(listener).toHaveBeenCalled();
  });
});

describe('ShellPlugin.openShellPicker', () => {
  it('opens a ShellPickerModal instance', () => {
    const plugin = makePlugin();
    expect(() => plugin.openShellPicker()).not.toThrow();
  });
});

describe('ShellPlugin.switchToSession', () => {
  it('shows a notice when the id is unknown', async () => {
    const plugin = makePlugin();
    await plugin.switchToSession('shell-99');
    expect(__getNotices().at(-1)?.message).toBe('Shell not found.');
  });

  it('reveals the existing leaf when another view already hosts the session', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(entry.id);
    leaf.view = view;
    vi.spyOn(plugin.app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.switchToSession(entry.id);
    expect(reveal).toHaveBeenCalledWith(leaf);
    expect(view.focusTerminal).toHaveBeenCalled();
  });

  it('attaches the active ShellView to the chosen session when no other leaf hosts it', async () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const activeLeaf = new WorkspaceLeaf();
    const activeView = new ShellView(activeLeaf as never, plugin as never);
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
    const otherView = new ShellView(otherLeaf as never, plugin as never);
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
    const view = new ShellView(leaf as never, plugin as never);
    leaf.view = view;
    const getLeafSpy = vi.spyOn(plugin.app.workspace, 'getLeaf').mockReturnValue(leaf);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.switchToSession(entry.id);
    expect(getLeafSpy).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: SHELL_VIEW_TYPE,
      active: true,
      state: { sessionId: entry.id },
    });
    expect(reveal).toHaveBeenCalledWith(leaf);
    expect(view.focusTerminal).toHaveBeenCalled();
  });
});

describe('ShellPlugin.killSession', () => {
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

describe('ShellPlugin.killAllSessions', () => {
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

describe('ShellPlugin.newShell', () => {
  it('creates a new tab leaf and opens a terminal view in it', async () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const getLeafSpy = vi.spyOn(plugin.app.workspace, 'getLeaf').mockReturnValue(leaf);
    const reveal = vi.spyOn(plugin.app.workspace, 'revealLeaf');
    await plugin.newShell();
    expect(getLeafSpy).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: SHELL_VIEW_TYPE, active: true });
    expect(reveal).toHaveBeenCalledWith(leaf);
  });
});

describe('ShellPlugin.killActiveShell', () => {
  it('kills the active shell when a terminal view is focused', () => {
    const plugin = makePlugin();
    const entry = plugin.createSession(80, 24);
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
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
    const view = new ShellView(leaf as never, plugin as never);
    view.getSessionId = vi.fn().mockReturnValue(null);
    vi.spyOn(plugin.app.workspace, 'getActiveViewOfType').mockReturnValue(view);
    expect(() => plugin.killActiveShell()).not.toThrow();
  });
});

describe('ShellPlugin.restartActiveShell', () => {
  it('tells the active view to reattach', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new ShellView(leaf as never, plugin as never);
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

describe('ShellPlugin.onunload', () => {
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

describe('ShellPlugin.onload', () => {
  it('registers the setting tab, both views, ribbon icon, and every command', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.__settingTabs).toHaveLength(1);
    expect(plugin.__viewFactories.has(SHELL_VIEW_TYPE)).toBe(true);
    expect(plugin.__viewFactories.has('obsidian-shell-list')).toBe(true);
    expect(plugin.__ribbonIcons.map((r) => r.icon)).toContain('terminal-square');
    expect(plugin.__findCommand('open')).toBeDefined();
    expect(plugin.__findCommand('new')).toBeDefined();
    expect(plugin.__findCommand('kill')).toBeDefined();
    expect(plugin.__findCommand('restart')).toBeDefined();
    expect(plugin.__findCommand('kill-all')).toBeDefined();
    expect(plugin.__findCommand('switch')).toBeDefined();
    expect(plugin.__findCommand('open-sidebar')).toBeDefined();
    expect(plugin.__findCommand('run-self-test')).toBeDefined();
    plugin.onunload();
  });

  it('constructs a ShellView through the registered factory', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const factory = plugin.__viewFactories.get(SHELL_VIEW_TYPE);
    expect(factory).toBeDefined();
    const leaf = new WorkspaceLeaf();
    expect(() => factory?.(leaf)).not.toThrow();
    plugin.onunload();
  });

  it('constructs a ShellsView through the registered factory', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const factory = plugin.__viewFactories.get('obsidian-shell-list');
    expect(factory).toBeDefined();
    const leaf = new WorkspaceLeaf();
    expect(() => factory?.(leaf)).not.toThrow();
    plugin.onunload();
  });
});

describe('ShellPlugin.onExternalSettingsChange', () => {
  it('reloads settings and refreshes open views', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => null);
    const refreshSpy = vi.spyOn(plugin, 'refreshOpenViews');
    await plugin.onExternalSettingsChange();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(refreshSpy).toHaveBeenCalled();
  });
});

describe('ShellPlugin.activateView', () => {
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
      type: SHELL_VIEW_TYPE,
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

describe('ShellPlugin.onUserEnable', () => {
  it('activates the view when no plugin data exists yet', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => null);
    plugin.saveData = vi.fn();
    const spy = vi.spyOn(plugin, 'activateView').mockResolvedValue();
    plugin.onUserEnable();
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('skips activation when plugin data is already persisted', async () => {
    const plugin = makePlugin();
    plugin.loadData = vi.fn(async () => ({}));
    const spy = vi.spyOn(plugin, 'activateView').mockResolvedValue();
    plugin.onUserEnable();
    // Give the async handler a turn.
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('shell commands wiring', () => {
  it('open calls activateView', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'activateView').mockResolvedValue();
    await plugin.__findCommand('open')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('new calls newShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'newShell').mockResolvedValue();
    await plugin.__findCommand('new')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('kill calls killActiveShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'killActiveShell').mockReturnValue();
    plugin.__findCommand('kill')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('restart calls restartActiveShell', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'restartActiveShell').mockReturnValue();
    plugin.__findCommand('restart')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('kill-all calls killAllSessions', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'killAllSessions').mockReturnValue();
    plugin.__findCommand('kill-all')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('switch calls openShellPicker', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'openShellPicker').mockReturnValue();
    plugin.__findCommand('switch')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('open-sidebar calls activateShellsView', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'activateShellsView').mockResolvedValue();
    plugin.__findCommand('open-sidebar')?.callback?.();
    expect(spy).toHaveBeenCalled();
    plugin.onunload();
  });

  it('the ribbon icon callback activates the shells view', async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const spy = vi.spyOn(plugin, 'activateShellsView').mockResolvedValue();
    const ribbon = plugin.__ribbonIcons.find((r) => r.icon === 'terminal-square');
    ribbon?.callback(new MouseEvent('click'));
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
