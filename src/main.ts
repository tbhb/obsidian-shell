import { type FileSystemAdapter, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { PtySession, probePty } from './pty';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type TerminalPluginSettings,
  TerminalSettingTab,
} from './settings';
import './styles.css';
import { TERMINAL_VIEW_TYPE, TerminalView } from './view';

export interface SessionEntry {
  id: string;
  label: string;
  session: PtySession;
}

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;
  private readonly sessions = new Map<string, SessionEntry>();
  private nextSessionNumber = 1;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new TerminalSettingTab(this.app, this));
    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => new TerminalView(leaf, this));
    this.addCommand({
      id: 'open-shell',
      name: 'Open shell',
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: 'new-shell',
      name: 'New shell',
      callback: () => this.newShell(),
    });
    this.addCommand({
      id: 'kill-shell',
      name: 'Kill shell',
      callback: () => this.killActiveShell(),
    });
    this.addCommand({
      id: 'restart-shell',
      name: 'Restart shell',
      callback: () => this.restartActiveShell(),
    });
    this.addCommand({
      id: 'kill-all-shells',
      name: 'Kill all shells',
      callback: () => this.killAllSessions(),
    });
    this.addCommand({
      id: 'run-self-test',
      name: 'Run self-test',
      callback: () => this.runPtySelfTest(),
    });
  }

  onunload(): void {
    this.killAllSessions();
  }

  onUserEnable(): void {
    void this.activateView();
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.refreshOpenViews();
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<TerminalPluginSettings> | null;
    this.settings = mergeSettings(stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshOpenViews();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: TERMINAL_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  async newShell(): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: TERMINAL_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  killActiveShell(): void {
    const view = this.findActiveTerminalView();
    if (!view) {
      new Notice('No active shell to kill.');
      return;
    }
    const id = view.getSessionId();
    if (!id) {
      return;
    }
    this.killSession(id);
  }

  restartActiveShell(): void {
    const view = this.findActiveTerminalView();
    if (!view) {
      new Notice('No active shell to restart.');
      return;
    }
    view.reattachSession();
  }

  resolveCwd(): string {
    const { strategy, fixedPath } = this.settings.cwd;
    const adapter = this.app.vault.adapter as FileSystemAdapter;
    if (strategy === 'fixed-path' && fixedPath) {
      return fixedPath;
    }
    if (strategy === 'note-dir') {
      const file = this.app.workspace.getActiveFile();
      if (file?.parent) {
        return adapter.getFullPath(file.parent.path);
      }
    }
    return adapter.getBasePath();
  }

  createSession(cols: number, rows: number): SessionEntry {
    const number = this.nextSessionNumber++;
    const id = `shell-${number}`;
    const label = `Shell ${number}`;
    const { shell } = this.settings;
    const session = new PtySession(this, {
      cwd: this.resolveCwd(),
      shell: shell.path || undefined,
      shellArgs: shell.args.length > 0 ? shell.args : undefined,
      cols,
      rows,
    });
    const entry: SessionEntry = { id, label, session };
    this.sessions.set(id, entry);
    return entry;
  }

  getSession(id: string): SessionEntry | null {
    const entry = this.sessions.get(id);
    if (!entry || entry.session.isDead) {
      return null;
    }
    return entry;
  }

  killSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      return;
    }
    entry.session.kill();
    this.sessions.delete(id);
  }

  killAllSessions(): void {
    for (const entry of this.sessions.values()) {
      entry.session.kill();
    }
    this.sessions.clear();
  }

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof TerminalView) {
        view.applySettings(this.settings);
      }
    }
  }

  private findActiveTerminalView(): TerminalView | null {
    const view = this.app.workspace.getActiveViewOfType(TerminalView);
    return view instanceof TerminalView ? view : null;
  }

  private async runPtySelfTest(): Promise<void> {
    try {
      const output = await probePty(this);
      new Notice(`Self-test: ${output}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Self-test failed: ${message}`);
    }
  }
}
