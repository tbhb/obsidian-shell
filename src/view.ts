import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITheme, Terminal } from '@xterm/xterm';
import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type TerminalPlugin from './main';
import type { PtySession } from './pty';
import type { TerminalPluginSettings } from './settings';

export const TERMINAL_VIEW_TYPE = 'obsidian-terminal';

const DEFAULT_DISPLAY_TEXT = 'Shell';

interface PersistedState {
  sessionId?: string;
}

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
  private resizeObserver: ResizeObserver | null = null;
  private session: PtySession | null = null;
  private sessionId: string | null = null;
  private label: string = DEFAULT_DISPLAY_TEXT;

  constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.label;
  }

  getIcon(): string {
    return 'terminal';
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getState(): Record<string, unknown> {
    const base = super.getState();
    return { ...base, sessionId: this.sessionId };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    // Only update sessionId when it is explicitly provided as a string.
    // Obsidian calls setState during workspace restore, layout operations,
    // and internal setViewState calls that omit our state keys. The previous
    // implementation clobbered a live binding to null in those cases, which
    // caused the sidebar's "attached" leaves to look detached and
    // switchToSession to fall through to opening a second view on the same
    // session.
    if (state && typeof state === 'object') {
      const next = (state as PersistedState).sessionId;
      if (typeof next === 'string' && next !== this.sessionId) {
        this.sessionId = next;
        if (this.terminal) {
          // setState arrived after onOpen with a new id — switch now.
          this.session?.detach();
          this.terminal.clear();
          this.session = null;
          this.bindSession();
        }
      }
    }
    return super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('obsidian-terminal-host');

    const { appearance, behavior } = this.plugin.settings;

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

    this.reserveStatusBarSpace();
    fitAddon.fit();

    // Obsidian's own onResize hook does not fire for every layout change
    // (for example, dragging a leaf from the right sidebar into a bottom
    // split). Observe containerEl (the outer leaf wrapper we never mutate)
    // so our own height writes on contentEl do not retrigger the observer.
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        this.reserveStatusBarSpace();
        this.fitAddon?.fit();
      });
    });
    this.resizeObserver.observe(this.containerEl);

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

    // Obsidian does not guarantee setState fires before onOpen on freshly
    // created views. Read the stored state from the leaf directly so
    // bindSession does not spawn an orphan session that setState would
    // then have to discard.
    if (!this.sessionId) {
      const state = this.leaf.getViewState()?.state;
      if (state && typeof state === 'object') {
        const id = (state as PersistedState).sessionId;
        if (typeof id === 'string') {
          this.sessionId = id;
        }
      }
    }

    this.bindSession();
    this.focusTerminalIfActive();
  }

  async onClose(): Promise<void> {
    // The plugin owns the PtySession so it survives the view being torn down
    // and recreated when the user drags the leaf into a different pane. Only
    // the xterm instance and the writer binding go away here.
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.contentEl.style.removeProperty('height');
    this.session?.detach();
    this.session = null;
    this.webglAddon?.dispose();
    this.webglAddon = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
    this.plugin.notifySessionsChanged();
  }

  reattachSession(): void {
    if (!this.terminal) {
      return;
    }
    this.session?.detach();
    if (this.sessionId) {
      this.plugin.killSession(this.sessionId);
    }
    this.sessionId = null;
    this.session = null;
    this.terminal.clear();
    this.bindSession();
    this.focusTerminalIfActive();
  }

  attachToSession(id: string): void {
    if (!this.terminal) {
      return;
    }
    const entry = this.plugin.getSession(id);
    if (!entry) {
      return;
    }
    if (this.sessionId === id) {
      this.focusTerminalIfActive();
      return;
    }
    this.session?.detach();
    this.terminal.clear();
    this.sessionId = entry.id;
    this.label = entry.label;
    entry.session.attach((data) => this.terminal?.write(data));
    this.session = entry.session;
    this.refreshTabTitle();
    this.focusTerminalIfActive();
    this.plugin.notifySessionsChanged();
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

  private bindSession(): void {
    if (!this.terminal) {
      return;
    }
    const existing = this.sessionId ? this.plugin.getSession(this.sessionId) : null;
    const entry = existing ?? this.plugin.createSession(this.terminal.cols, this.terminal.rows);
    this.sessionId = entry.id;
    this.label = entry.label;
    entry.session.attach((data) => this.terminal?.write(data));
    this.session = entry.session;
    this.refreshTabTitle();
    this.plugin.notifySessionsChanged();
  }

  private focusTerminalIfActive(): void {
    // Only steal focus when this view is already the active one. On startup
    // Obsidian re-opens every view, and we do not want to yank focus out of
    // whichever pane the user is working in.
    if (this.app.workspace.getActiveViewOfType(TerminalView) !== this) {
      return;
    }
    requestAnimationFrame(() => this.terminal?.focus());
  }

  private reserveStatusBarSpace(): void {
    // Obsidian's app status bar is a position: absolute overlay pinned to
    // the bottom-right of the window, not a layout sibling of the workspace
    // splits. A terminal rendering edge-to-edge hides its bottom row under
    // the overlay. FitAddon's measurement only subtracts padding on the
    // .xterm element, so CSS-only fixes either overshoot or leave a gap.
    // Measure the overlay at runtime and shrink the content element so its
    // bottom sits at the overlay's top edge; FitAddon then reads an
    // accurate available height.
    const statusBar = document.querySelector('.status-bar');
    if (!(statusBar instanceof HTMLElement)) {
      this.contentEl.style.removeProperty('height');
      return;
    }
    const sbRect = statusBar.getBoundingClientRect();
    if (sbRect.height === 0) {
      this.contentEl.style.removeProperty('height');
      return;
    }
    const contentRect = this.contentEl.getBoundingClientRect();
    const target = Math.max(0, Math.floor(sbRect.top - contentRect.top));
    // Skip no-op writes to keep ResizeObserver callbacks quiet.
    if (Math.abs(target - this.contentEl.clientHeight) < 1) {
      return;
    }
    this.contentEl.style.height = `${target}px`;
  }

  private refreshTabTitle(): void {
    // ItemView does not expose a public way to reflect getDisplayText changes,
    // but the tab header exposes the title element on the leaf. Fall back to
    // requestSaveLayout if the element is not available yet (pre-mount).
    const header = (this.leaf as { tabHeaderInnerTitleEl?: HTMLElement }).tabHeaderInnerTitleEl;
    if (header) {
      header.setText(this.label);
      return;
    }
    this.app.workspace.requestSaveLayout();
  }
}
