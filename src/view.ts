import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITheme, Terminal } from '@xterm/xterm';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type TerminalPlugin from './main';
import type { PtySession } from './pty';
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

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.webglAddon = webglAddon;

    terminal.onData((data) => this.session?.write(data));
    terminal.onResize(({ cols, rows }) => this.session?.resize(cols, rows));

    this.bindSession();
  }

  async onClose(): Promise<void> {
    // The plugin owns the PtySession so it survives the view being torn down
    // and recreated when the user drags the leaf into a different pane. Only
    // the xterm instance and the writer binding go away here.
    this.session?.detach();
    this.session = null;
    this.webglAddon?.dispose();
    this.webglAddon = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }

  reattachSession(): void {
    if (!this.terminal) {
      return;
    }
    this.session?.detach();
    this.terminal.clear();
    this.session = null;
    this.bindSession();
  }

  private bindSession(): void {
    if (!this.terminal) {
      return;
    }
    const session = this.plugin.getOrCreateSession(this.terminal.cols, this.terminal.rows);
    session.attach((data) => this.terminal?.write(data));
    this.session = session;
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
