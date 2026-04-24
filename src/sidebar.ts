import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type ShellPlugin from './main';
import type { SessionEntry, SessionState } from './main';

export const SHELLS_VIEW_TYPE = 'obsidian-shell-list';

const STATE_LABEL: Record<SessionState, string> = {
  attached: 'attached',
  detached: 'detached',
  exited: 'exited',
};

export class ShellsView extends ItemView {
  private readonly plugin: ShellPlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ShellPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  override getViewType(): string {
    return SHELLS_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return 'Shells';
  }

  override getIcon(): string {
    return 'terminal-square';
  }

  override onOpen(): Promise<void> {
    this.contentEl.addClass('obsidian-shell-list-panel');
    this.render();
    this.unsubscribe = this.plugin.onSessionsChanged(() => {
      this.render();
    });
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return Promise.resolve();
  }

  render(): void {
    this.contentEl.empty();
    const sessions = this.plugin.listSessions();
    if (sessions.length === 0) {
      this.contentEl.createEl('p', {
        cls: 'obsidian-shell-list-empty',
        text: 'No shells running. Open one from the command palette.',
      });
      return;
    }
    const list = this.contentEl.createDiv({ cls: 'obsidian-shell-list-items' });
    for (const entry of sessions) {
      this.renderRow(list, entry);
    }
  }

  private renderRow(parent: HTMLElement, entry: SessionEntry): void {
    const state = this.plugin.describeSessionState(entry);
    const row = parent.createDiv({ cls: 'obsidian-shell-list-row' });
    row.dataset['state'] = state;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    const labelEl = row.createSpan({ cls: 'obsidian-shell-list-label' });
    labelEl.setText(entry.label);

    const badge = row.createSpan({ cls: 'obsidian-shell-list-state' });
    badge.setText(STATE_LABEL[state]);

    const actions = row.createDiv({ cls: 'obsidian-shell-list-actions' });
    const killBtn = actions.createEl('button', {
      cls: 'clickable-icon obsidian-shell-list-kill',
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
