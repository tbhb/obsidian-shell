// jscpd:ignore-start
import { WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type ShellPlugin from '../../src/main';
import { SHELLS_VIEW_TYPE, ShellsView } from '../../src/sidebar';
import { makeSessionEntry as makeEntry, makePlugin } from '../helpers/plugin';

vi.mock('../../src/pty', async () => (await import('../helpers/mocks')).ptyMockFactory());
vi.mock('../../src/view', async () => (await import('../helpers/mocks')).viewMockFactory());
// jscpd:ignore-end

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
  let plugin: ShellPlugin;
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
    const empty = view.contentEl.querySelector('.obsidian-shell-list-empty');
    expect(empty?.textContent).toContain('No shells');
  });

  it('renders one row per session with a label and state badge', () => {
    const sessions = [makeEntry('Shell 1'), makeEntry('Shell 2', true)];
    vi.spyOn(plugin, 'listSessions').mockReturnValue(sessions);
    vi.spyOn(plugin, 'describeSessionState').mockImplementation((entry) =>
      entry.session.isDead ? 'exited' : 'detached',
    );
    view.render();
    const listRoot = view.contentEl.querySelector('.obsidian-shell-list-items');
    expect(listRoot).not.toBeNull();
    const rows = view.contentEl.querySelectorAll('.obsidian-shell-list-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.obsidian-shell-list-label')?.textContent).toBe('Shell 1');
    expect((rows[0] as HTMLElement | undefined)?.dataset['state']).toBe('detached');
    expect((rows[1] as HTMLElement | undefined)?.dataset['state']).toBe('exited');
    expect(rows[0]?.getAttribute('role')).toBe('button');
    expect(rows[0]?.getAttribute('tabindex')).toBe('0');
    expect(rows[0]?.querySelector('.obsidian-shell-list-state')?.textContent).toBe('detached');
    expect(rows[1]?.querySelector('.obsidian-shell-list-state')?.textContent).toBe('exited');
    expect(rows[0]?.querySelector('.obsidian-shell-list-actions')).not.toBeNull();
  });

  it('renders the attached state label when the plugin reports attached', () => {
    vi.spyOn(plugin, 'listSessions').mockReturnValue([makeEntry('Shell 1')]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('attached');
    view.render();
    const badge = view.contentEl.querySelector('.obsidian-shell-list-state');
    expect(badge?.textContent).toBe('attached');
  });

  it('labels the kill button with the session label and stamps an x icon', () => {
    vi.spyOn(plugin, 'listSessions').mockReturnValue([makeEntry('Shell 7')]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    view.render();
    const killBtn = view.contentEl.querySelector<HTMLButtonElement>('.obsidian-shell-list-kill');
    expect(killBtn?.getAttribute('aria-label')).toBe('Kill Shell 7');
    expect(killBtn?.dataset['icon']).toBe('x');
  });

  function setupSingleRow() {
    const entry = makeEntry('Shell 1');
    vi.spyOn(plugin, 'listSessions').mockReturnValue([entry]);
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    const switchSpy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    view.render();
    const row = view.contentEl.querySelector('.obsidian-shell-list-row') as HTMLElement;
    return { entry, switchSpy, row };
  }

  it('clicking a row switches to that session', () => {
    const { entry, switchSpy, row } = setupSingleRow();
    row.click();
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('pressing Enter on a row switches to that session', () => {
    const { entry, switchSpy, row } = setupSingleRow();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('pressing Space on a row switches to that session', () => {
    const { entry, switchSpy, row } = setupSingleRow();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(switchSpy).toHaveBeenCalledWith(entry.id);
  });

  it('ignores unrelated keys on a row', () => {
    const { switchSpy, row } = setupSingleRow();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it('clicking the kill button kills only that session without switching', () => {
    const { entry, switchSpy } = setupSingleRow();
    const killSpy = vi.spyOn(plugin, 'killSession').mockReturnValue();
    const killBtn = view.contentEl.querySelector('.obsidian-shell-list-kill') as HTMLButtonElement;
    killBtn.click();
    expect(killSpy).toHaveBeenCalledWith(entry.id);
    expect(switchSpy).not.toHaveBeenCalled();
  });
});

describe('ShellsView lifecycle', () => {
  let plugin: ShellPlugin;
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
    expect(view.contentEl.classList.contains('obsidian-shell-list-panel')).toBe(true);
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
