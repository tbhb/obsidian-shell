import { type App, FuzzySuggestModal } from 'obsidian';
import type ShellPlugin from './main';
import type { SessionEntry } from './main';

export class ShellPickerModal extends FuzzySuggestModal<SessionEntry> {
  private readonly plugin: ShellPlugin;

  constructor(app: App, plugin: ShellPlugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Switch to shell...');
  }

  getItems(): SessionEntry[] {
    return this.plugin.listSessions();
  }

  getItemText(entry: SessionEntry): string {
    const state = this.plugin.describeSessionState(entry);
    return `${entry.label} — ${state}`;
  }

  onChooseItem(entry: SessionEntry): void {
    void this.plugin.switchToSession(entry.id);
  }
}
