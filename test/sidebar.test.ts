import { App, WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEntry } from '../src/main';
import TerminalPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SHELLS_VIEW_TYPE, ShellsView } from '../src/sidebar';

vi.mock('../src/pty', () => {
  const ctor = vi.fn(function ctorImpl(this: Record<string, unknown>) {
    this.isDead = false;
    this.kill = vi.fn();
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

function makePlugin(): TerminalPlugin {
  const plugin = new TerminalPlugin(new App() as never, { id: 'obsidian-terminal' } as never);
  plugin.settings = structuredClone(DEFAULT_SETTINGS);
  return plugin;
}

function makeEntry(label: string, isDead = false): SessionEntry {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    session: { isDead } as never,
  };
}

describe('ShellsView metadata', () => {
  it('exposes the view type, display text, and icon', () => {
    const plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    const view = new ShellsView(leaf, plugin);
    expect(view.getViewType()).toBe(SHELLS_VIEW_TYPE);
    expect(view.getDisplayText()).toBe('Shells');
    expect(view.getIcon()).toBe('terminal-square');
  });
});

describe('ShellsView.render', () => {
  let plugin: TerminalPlugin;
  let view: ShellsView;

  beforeEach(() => {
    plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    view = new ShellsView(leaf, plugin);
    document.body.appendChild(view.contentEl);
  });

  it('shows an empty state when there are no sessions', () => {
    vi.spyOn(plugin, 'listSessions').mockReturnValue([]);
    view.render();
    const empty = view.contentEl.querySelector('.obsidian-terminal-shells-empty');
    expect(empty?.textContent).toContain('No shells');
  });

  it('renders one row per session with a label and state badge', () => {
    const sessions = [makeEntry('Shell 1'), makeEntry('Shell 2', true)];
    vi.spyOn(plugin, 'listSessions').mockReturnValue(sessions);
    vi.spyOn(plugin, 'describeSessionState').mockImplementation((entry) =>
      entry.session.isDead ? 'exited' : 'detached',
    );
    view.render();
    const rows = view.contentEl.querySelectorAll('.obsidian-terminal-shells-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.obsidian-terminal-shells-label')?.textContent).toBe('Shell 1');
    expect((rows[0] as HTMLElement | undefined)?.dataset.state).toBe('detached');
    expect((rows[1] as HTMLElement | undefined)?.dataset.state).toBe('exited');
  });

  it('clicking a row switches to that session', () => {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    view.render();
    const row = view.contentEl.querySelector('.obsidian-terminal-shells-row') as HTMLElement;
    row.click();
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('pressing Enter on a row switches to that session', () => {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    view.render();
    const row = view.contentEl.querySelector('.obsidian-terminal-shells-row') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('pressing Space on a row switches to that session', () => {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    view.render();
    const row = view.contentEl.querySelector('.obsidian-terminal-shells-row') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('ignores unrelated keys on a row', () => {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    view.render();
    const row = view.contentEl.querySelector('.obsidian-terminal-shells-row') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it('clicking the kill button kills only that session without switching', () => {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    const killSpy = vi.spyOn(plugin, 'killSession').mockReturnValue();
    view.render();
    const killBtn = view.contentEl.querySelector(
      '.obsidian-terminal-shells-kill',
    ) as HTMLButtonElement;
    killBtn.click();
    expect(killSpy).toHaveBeenCalledWith(entry.id);
    expect(switchSpy).not.toHaveBeenCalled();
  });
});

describe('ShellsView lifecycle', () => {
  let plugin: TerminalPlugin;
  let view: ShellsView;

  beforeEach(() => {
    plugin = makePlugin();
    const leaf = new WorkspaceLeaf();
    view = new ShellsView(leaf, plugin);
  });

  it('onOpen renders and subscribes to session changes', async () => {
    const subscribeSpy = vi.spyOn(plugin, 'onSessionsChanged');
    await view.onOpen();
    expect(subscribeSpy).toHaveBeenCalled();
    expect(view.contentEl.classList.contains('obsidian-terminal-shells-panel')).toBe(true);
  });

  it('onClose unsubscribes from the plugin', async () => {
    const unsub = vi.fn();
    vi.spyOn(plugin, 'onSessionsChanged').mockReturnValue(unsub);
    await view.onOpen();
    await view.onClose();
    expect(unsub).toHaveBeenCalled();
  });

  it('onClose is a no-op when nothing was subscribed', async () => {
    await expect(view.onClose()).resolves.toBeUndefined();
  });

  it('session-changed callback re-renders the list', async () => {
    let trigger: (() => void) | undefined;
    vi.spyOn(plugin, 'onSessionsChanged').mockImplementation((cb) => {
      trigger = cb;
      return () => undefined;
    });
    await view.onOpen();
    const renderSpy = vi.spyOn(view, 'render');
    trigger?.();
    expect(renderSpy).toHaveBeenCalled();
  });
});
