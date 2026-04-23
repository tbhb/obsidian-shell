import { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEntry } from '../src/main';
import TerminalPlugin from '../src/main';
import { ShellPickerModal } from '../src/picker';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.mock('../src/pty', () => {
  const ctor = vi.fn(function ctorImpl(this: Record<string, unknown>) {
    this.isDead = false;
    this.kill = vi.fn();
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

describe('ShellPickerModal', () => {
  let plugin: TerminalPlugin;
  let modal: ShellPickerModal;

  beforeEach(() => {
    plugin = makePlugin();
    modal = new ShellPickerModal(plugin.app, plugin);
  });

  it('lists every session the plugin knows about', () => {
    const entries = [makeEntry('Shell 1'), makeEntry('Shell 2')];
    vi.spyOn(plugin, 'listSessions').mockReturnValue(entries);
    expect(modal.getItems()).toEqual(entries);
  });

  it('renders each row with the label and the state', () => {
    const entry = makeEntry('Shell 3');
    vi.spyOn(plugin, 'describeSessionState').mockReturnValue('detached');
    expect(modal.getItemText(entry)).toBe('Shell 3 — detached');
  });

  it('delegates selection to switchToSession', () => {
    const entry = makeEntry('Shell 4');
    const spy = vi.spyOn(plugin, 'switchToSession').mockResolvedValue();
    modal.onChooseItem(entry, new MouseEvent('click'));
    expect(spy).toHaveBeenCalledWith(entry.id);
  });
});
