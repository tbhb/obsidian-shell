import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { ShellPickerModal } from './picker';
import { PtySession, probePty } from './pty';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type ShellPluginSettings,
  ShellSettingTab,
} from './settings';
import { SHELLS_VIEW_TYPE, ShellsView } from './sidebar';
import './styles.css';
import { SHELL_VIEW_TYPE, ShellView } from './view';

export interface SessionEntry {
  id: string;
  label: string;
  session: PtySession;
}

export type SessionState = 'attached' | 'detached' | 'exited';

export default class ShellPlugin extends Plugin {
  settings: ShellPluginSettings = DEFAULT_SETTINGS;
  private readonly sessions = new Map<string, SessionEntry>();
  private nextSessionNumber = 1;
  private readonly sessionListeners = new Set<() => void>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ShellSettingTab(this.app, this));
    this.registerView(SHELL_VIEW_TYPE, (leaf) => new ShellView(leaf, this));
    this.registerView(SHELLS_VIEW_TYPE, (leaf) => new ShellsView(leaf, this));
    this.addRibbonIcon('terminal-square', 'Shells', () => {
      void this.activateShellsView();
    });
    this.addCommand({
      id: 'open',
      name: 'Open',
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: 'open-sidebar',
      name: 'Open sidebar',
      callback: () => this.activateShellsView(),
    });
    this.addCommand({
      id: 'new',
      name: 'New',
      callback: () => this.newShell(),
    });
    this.addCommand({
      id: 'kill',
      name: 'Kill',
      callback: () => {
        this.killActiveShell();
      },
    });
    this.addCommand({
      id: 'restart',
      name: 'Restart',
      callback: () => {
        this.restartActiveShell();
      },
    });
    this.addCommand({
      id: 'kill-all',
      name: 'Kill all',
      callback: () => {
        this.killAllSessions();
      },
    });
    this.addCommand({
      id: 'switch',
      name: 'Switch',
      callback: () => {
        this.openShellPicker();
      },
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
    void this.maybeAutoOpenFirstShell();
  }

  private async maybeAutoOpenFirstShell(): Promise<void> {
    // Only auto-open on the very first enable. Subsequent enables
    // (workspace reload, Hot Reload after a build, toggling the plugin off
    // and back on) would otherwise spawn a surprise shell every time.
    const persisted = await this.loadData();
    if (persisted !== null) {
      return;
    }
    await this.saveData(this.settings);
    await this.activateView();
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.refreshOpenViews();
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ShellPluginSettings> | null;
    this.settings = mergeSettings(stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshOpenViews();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SHELL_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: SHELL_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  async activateShellsView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SHELLS_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeftLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: SHELLS_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  async newShell(): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: SHELL_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  killActiveShell(): void {
    const view = this.findActiveShellView();
    if (!view) {
      new Notice('No active shell to kill.');
      return;
    }
    const id = view.getSessionId();
    if (id === null || id === '') {
      return;
    }
    this.killSession(id);
  }

  restartActiveShell(): void {
    const view = this.findActiveShellView();
    if (!view) {
      new Notice('No active shell to restart.');
      return;
    }
    view.reattachSession();
  }

  resolveCwd(): string {
    const { strategy, fixedPath } = this.settings.cwd;
    const adapter = this.app.vault['adapter'];
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
    const options: {
      cwd: string;
      cols: number;
      rows: number;
      shell?: string;
      shellArgs?: string[];
    } = {
      cwd: this.resolveCwd(),
      cols,
      rows,
    };
    if (shell.path) options.shell = shell.path;
    if (shell.args.length > 0) options.shellArgs = shell.args;
    const session = new PtySession(this, options);
    session.onExit(() => {
      this.notifySessionsChanged();
    });
    const entry: SessionEntry = { id, label, session };
    this.sessions.set(id, entry);
    this.notifySessionsChanged();
    return entry;
  }

  getSession(id: string): SessionEntry | null {
    return this.sessions.get(id) ?? null;
  }

  listSessions(): SessionEntry[] {
    return Array.from(this.sessions.values());
  }

  isSessionAttached(id: string): boolean {
    for (const leaf of this.app.workspace.getLeavesOfType(SHELL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ShellView && view.getSessionId() === id) {
        return true;
      }
    }
    return false;
  }

  describeSessionState(entry: SessionEntry): SessionState {
    if (entry.session.isDead) {
      return 'exited';
    }
    return this.isSessionAttached(entry.id) ? 'attached' : 'detached';
  }

  async switchToSession(id: string): Promise<void> {
    const entry = this.getSession(id);
    if (!entry) {
      new Notice('Shell not found.');
      return;
    }
    const { workspace } = this.app;
    // If some leaf already hosts this session, just reveal it. Moving a live
    // session between leaves creates a tug-of-war over the same writer.
    for (const leaf of workspace.getLeavesOfType(SHELL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ShellView && view.getSessionId() === id) {
        await workspace.revealLeaf(leaf);
        view.focusTerminal();
        return;
      }
    }
    const activeView = this.findActiveShellView();
    if (activeView) {
      activeView.attachToSession(id);
      return;
    }
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({
      type: SHELL_VIEW_TYPE,
      active: true,
      state: { sessionId: id },
    });
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof ShellView) {
      view.focusTerminal();
    }
  }

  openShellPicker(): void {
    new ShellPickerModal(this.app, this).open();
  }

  killSession(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) {
      return;
    }
    entry.session.kill();
    this.sessions.delete(id);
    this.notifySessionsChanged();
  }

  killAllSessions(): void {
    if (this.sessions.size === 0) {
      return;
    }
    for (const entry of this.sessions.values()) {
      entry.session.kill();
    }
    this.sessions.clear();
    this.notifySessionsChanged();
  }

  onSessionsChanged(cb: () => void): () => void {
    this.sessionListeners.add(cb);
    return () => {
      this.sessionListeners.delete(cb);
    };
  }

  notifySessionsChanged(): void {
    for (const cb of this.sessionListeners) {
      cb();
    }
  }

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(SHELL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ShellView) {
        view.applySettings(this.settings);
      }
    }
  }

  findActiveShellView(): ShellView | null {
    const view = this.app.workspace.getActiveViewOfType(ShellView);
    return view instanceof ShellView ? view : null;
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
