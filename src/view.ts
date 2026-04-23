import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITheme, Terminal } from '@xterm/xterm';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type TerminalPlugin from './main';
import { PtySession } from './pty';
import type { TerminalPluginSettings } from './settings';

export const TERMINAL_VIEW_TYPE = 'obsidian-terminal';

function resolveFontFamily(el: HTMLElement, override: string): string {
  if (override) {
    return override;
  }
  // xterm's WebGL renderer measures glyphs via canvas, which cannot resolve
  // CSS custom properties. Grab the concrete font stack Obsidian uses before
  // handing it to the terminal.
  const monospace = getComputedStyle(el).getPropertyValue('--font-monospace').trim();
  return monospace || 'monospace';
}

function resolveObsidianTheme(el: HTMLElement): ITheme {
  const cs = getComputedStyle(el);
  const background = cs.getPropertyValue('--background-primary').trim();
  const foreground = cs.getPropertyValue('--text-normal').trim();
  const cursor = cs.getPropertyValue('--text-accent').trim();
  const selectionBackground = cs.getPropertyValue('--text-highlight-bg').trim();
  return {
    background: background || undefined,
    foreground: foreground || undefined,
    cursor: cursor || undefined,
    selectionBackground: selectionBackground || undefined,
  };
}

export class TerminalView extends ItemView {
  private readonly plugin: TerminalPlugin;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private webglAddon: WebglAddon | null = null;
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

    const { appearance, behavior, shell } = this.plugin.settings;

    const terminal = new Terminal({
      fontFamily: resolveFontFamily(this.contentEl, appearance.fontFamily),
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      cursorStyle: appearance.cursorStyle,
      cursorBlink: appearance.cursorBlink,
      scrollback: behavior.scrollback,
      theme: appearance.followObsidianTheme ? resolveObsidianTheme(this.contentEl) : undefined,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(this.contentEl);

    // Match VS Code's rendering path. The DOM fallback stays active if WebGL
    // cannot initialize on this machine (older GPUs, headless environments).
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon?.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    fitAddon.fit();

    terminal.onSelectionChange(() => {
      if (this.plugin.settings.behavior.copyOnSelection && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
      }
    });

    const { cols, rows } = terminal;
    const session = new PtySession(this.plugin, {
      cols,
      rows,
      cwd: this.plugin.resolveCwd(),
      shell: shell.path || undefined,
      shellArgs: shell.args.length > 0 ? shell.args : undefined,
    });

    session.onData((data) => terminal.write(data));
    terminal.onData((data) => session.write(data));
    terminal.onResize(({ cols: c, rows: r }) => session.resize(c, r));
    session.onExit(() => {
      terminal.write('\r\n[process exited]\r\n');
    });

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.webglAddon = webglAddon;
    this.session = session;
  }

  async onClose(): Promise<void> {
    this.session?.kill();
    this.session = null;
    this.webglAddon?.dispose();
    this.webglAddon = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }

  onResize(): void {
    this.fitAddon?.fit();
  }

  applySettings(settings: TerminalPluginSettings): void {
    if (!this.terminal) {
      return;
    }
    const { appearance, behavior } = settings;
    this.terminal.options = {
      fontFamily: resolveFontFamily(this.contentEl, appearance.fontFamily),
      fontSize: appearance.fontSize,
      lineHeight: appearance.lineHeight,
      cursorStyle: appearance.cursorStyle,
      cursorBlink: appearance.cursorBlink,
      scrollback: behavior.scrollback,
      theme: appearance.followObsidianTheme ? resolveObsidianTheme(this.contentEl) : undefined,
    };
    this.fitAddon?.fit();
  }
}
