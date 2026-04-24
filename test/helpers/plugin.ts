import { App } from 'obsidian';
import type { SessionEntry } from '../../src/main';
import ShellPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/settings';

export function makePlugin(): ShellPlugin {
  const plugin = new ShellPlugin(new App() as never, { id: 'shell' } as never);
  plugin.settings = structuredClone(DEFAULT_SETTINGS);
  return plugin;
}

export function makeSessionEntry(label: string, isDead = false): SessionEntry {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    session: { isDead } as never,
  };
}
