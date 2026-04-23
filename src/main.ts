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

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;
  private ptySession: PtySession | null = null;

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
      id: 'restart-shell',
      name: 'Restart shell',
      callback: () => this.restartSession(),
    });
    this.addCommand({
      id: 'run-self-test',
      name: 'Run self-test',
      callback: () => this.runPtySelfTest(),
    });
  }

  onunload(): void {
    this.ptySession?.kill();
    this.ptySession = null;
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

  getOrCreateSession(cols: number, rows: number): PtySession {
    if (this.ptySession && !this.ptySession.isDead) {
      this.ptySession.resize(cols, rows);
      return this.ptySession;
    }
    const { shell } = this.settings;
    this.ptySession = new PtySession(this, {
      cwd: this.resolveCwd(),
      shell: shell.path || undefined,
      shellArgs: shell.args.length > 0 ? shell.args : undefined,
      cols,
      rows,
    });
    return this.ptySession;
  }

  restartSession(): void {
    this.ptySession?.kill();
    this.ptySession = null;
    for (const leaf of this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof TerminalView) {
        view.reattachSession();
      }
    }
  }

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof TerminalView) {
        view.applySettings(this.settings);
      }
    }
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
