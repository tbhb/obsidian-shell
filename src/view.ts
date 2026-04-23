import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type TerminalPlugin from './main';
import { PtySession } from './pty';

export const TERMINAL_VIEW_TYPE = 'obsidian-terminal';

export class TerminalView extends ItemView {
  private readonly plugin: TerminalPlugin;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private session: PtySession | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Shell';
  }

  getIcon(): string {
    return 'terminal';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('obsidian-terminal-host');

    const terminal = new Terminal({
      fontFamily: 'var(--font-monospace), monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(this.contentEl);
    fitAddon.fit();

    const { cols, rows } = terminal;
    const session = new PtySession(this.plugin, { cols, rows });

    session.onData((data) => terminal.write(data));
    terminal.onData((data) => session.write(data));
    terminal.onResize(({ cols: c, rows: r }) => session.resize(c, r));
    session.onExit(() => {
      terminal.write('\r\n[process exited]\r\n');
    });

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.session = session;
  }

  async onClose(): Promise<void> {
    this.session?.kill();
    this.session = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }

  onResize(): void {
    this.fitAddon?.fit();
  }
}
