import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type TerminalPlugin from './main';
import type { SessionEntry, SessionState } from './main';

export const SHELLS_VIEW_TYPE = 'obsidian-terminal-shells';

const STATE_LABEL: Record<SessionState, string> = {
  attached: 'attached',
  detached: 'detached',
  exited: 'exited',
};

export class ShellsView extends ItemView {
  private readonly plugin: TerminalPlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SHELLS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Shells';
  }

  getIcon(): string {
    return 'terminal-square';
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('obsidian-terminal-shells-panel');
    this.render();
    this.unsubscribe = this.plugin.onSessionsChanged(() => this.render());
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  render(): void {
    this.contentEl.empty();
    const sessions = this.plugin.listSessions();
    if (sessions.length === 0) {
      this.contentEl.createEl('p', {
        cls: 'obsidian-terminal-shells-empty',
        text: 'No shells running. Open one from the command palette.',
      });
      return;
    }
    const list = this.contentEl.createDiv({ cls: 'obsidian-terminal-shells-list' });
    for (const entry of sessions) {
      this.renderRow(list, entry);
    }
  }

  private renderRow(parent: HTMLElement, entry: SessionEntry): void {
    const state = this.plugin.describeSessionState(entry);
    const row = parent.createDiv({ cls: 'obsidian-terminal-shells-row' });
    row.dataset.state = state;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    const labelEl = row.createSpan({ cls: 'obsidian-terminal-shells-label' });
    labelEl.setText(entry.label);

    const badge = row.createSpan({ cls: 'obsidian-terminal-shells-state' });
    badge.setText(STATE_LABEL[state]);

    const actions = row.createDiv({ cls: 'obsidian-terminal-shells-actions' });
    const killBtn = actions.createEl('button', {
      cls: 'clickable-icon obsidian-terminal-shells-kill',
      attr: { 'aria-label': `Kill ${entry.label}` },
    });
    setIcon(killBtn, 'x');
    killBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.plugin.killSession(entry.id);
    });

    row.addEventListener('click', () => {
      void this.plugin.switchToSession(entry.id);
    });
    row.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        void this.plugin.switchToSession(entry.id);
      }
    });
  }
}
