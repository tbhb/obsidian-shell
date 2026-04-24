import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITerminalOptions, type ITheme, Terminal } from '@xterm/xterm';
import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type ShellPlugin from './main';
import type { PtySession } from './pty';
import type { ShellPluginSettings } from './settings';

export const SHELL_VIEW_TYPE = 'obsidian-shell';

const DEFAULT_DISPLAY_TEXT = 'Shell';

interface PersistedState {
  sessionId?: string;
}

function resolveFontFamily(el: HTMLElement, override: string): string {
  if (override) {
    return override;
  }
  // xterm's WebGL renderer measures glyphs via canvas, which can't resolve
  // CSS custom properties. Grab the concrete font stack Obsidian uses before
  // handing it to the terminal.
  const monospace = getComputedStyle(el).getPropertyValue('--font-monospace').trim();
  return monospace || 'monospace';
}

function buildTerminalOptions(el: HTMLElement, settings: ShellPluginSettings): ITerminalOptions {
  const { appearance, behavior } = settings;
  const options: ITerminalOptions = {
    fontFamily: resolveFontFamily(el, appearance.fontFamily),
    fontSize: appearance.fontSize,
    lineHeight: appearance.lineHeight,
    cursorStyle: appearance.cursorStyle,
    cursorBlink: appearance.cursorBlink,
    scrollback: behavior.scrollback,
  };
  if (appearance.followObsidianTheme) {
    options.theme = resolveObsidianTheme(el);
  }
  return options;
}

function resolveObsidianTheme(el: HTMLElement): ITheme {
  const cs = getComputedStyle(el);
  const theme: ITheme = {};
  const background = cs.getPropertyValue('--background-primary').trim();
  if (background) theme.background = background;
  const foreground = cs.getPropertyValue('--text-normal').trim();
  if (foreground) theme.foreground = foreground;
  const cursor = cs.getPropertyValue('--text-accent').trim();
  if (cursor) theme.cursor = cursor;
  const selectionBackground = cs.getPropertyValue('--text-highlight-bg').trim();
  if (selectionBackground) theme.selectionBackground = selectionBackground;
  return theme;
}

export class ShellView extends ItemView {
  private readonly plugin: ShellPlugin;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private webglAddon: WebglAddon | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private session: PtySession | null = null;
  private sessionId: string | null = null;
  private sessionCreatedByThisView = false;
  private label: string = DEFAULT_DISPLAY_TEXT;

  constructor(leaf: WorkspaceLeaf, plugin: ShellPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  override getViewType(): string {
    return SHELL_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return this.label;
  }

  override getIcon(): string {
    return 'terminal';
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  override getState(): Record<string, unknown> {
    const base = super.getState();
    return { ...base, sessionId: this.sessionId };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    // Only update sessionId when explicitly provided as a string. Obsidian
    // also calls setState during workspace restore, layout operations, and
    // internal setViewState calls that omit these state keys. Clobbering the
    // live binding to null in those cases stranded attached views.
    if (state !== null && typeof state === 'object') {
      const next = (state as PersistedState).sessionId;
      if (typeof next === 'string' && next !== this.sessionId) {
        const previousId = this.sessionId;
        const orphan = this.sessionCreatedByThisView;
        this.sessionId = next;
        if (this.terminal !== null) {
          // setState arrived after onOpen. Discard the session bindSession
          // spawned as a placeholder, since it only ever bound to this view.
          this.session?.detach();
          this.session = null;
          this.terminal.clear();
          // biome-ignore lint/nursery/noUnnecessaryConditions: bindSession sets orphan to true before setState fires with a different id
          if (orphan && previousId !== null && !this.plugin.isSessionAttached(previousId)) {
            this.plugin.killSession(previousId);
          }
          this.bindSession();
        }
      }
    }
    return super.setState(state, result);
  }

  override onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('obsidian-shell-host');

    const terminal = new Terminal({
      ...buildTerminalOptions(this.contentEl, this.plugin.settings),
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(this.contentEl);

    // Match VS Code's rendering path. The DOM fallback stays active if WebGL
    // can't initialize on this machine (older GPUs, headless environments).
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

    // Obsidian's own onResize hook doesn't fire for every layout change
    // (dragging a leaf from the right sidebar into a bottom split, say).
    // Observe containerEl (the outer leaf wrapper the view never mutates)
    // so inline height writes on contentEl don't fire the observer again.
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

    // Obsidian doesn't guarantee setState fires before onOpen on freshly
    // created views. Read the stored state from the leaf directly so
    // bindSession doesn't start an orphan session that setState would
    // then have to discard.
    if (this.sessionId === null) {
      const state = this.leaf.getViewState()?.state;
      if (state !== undefined && typeof state === 'object') {
        const id = (state as PersistedState).sessionId;
        if (typeof id === 'string') {
          this.sessionId = id;
        }
      }
    }

    this.bindSession();
    this.focusTerminalIfActive();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    // The plugin owns the PtySession so it survives the view tearing down
    // and recreating when the user drags the leaf into a different pane.
    // Only the xterm instance and the writer binding go away here.
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
    return Promise.resolve();
  }

  reattachSession(): void {
    if (this.terminal === null) {
      return;
    }
    this.session?.detach();
    if (this.sessionId !== null) {
      this.plugin.killSession(this.sessionId);
    }
    this.sessionId = null;
    this.session = null;
    this.terminal.clear();
    this.bindSession();
    this.focusTerminal();
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
    this.sessionCreatedByThisView = false;
    this.refreshTabTitle();
    this.focusTerminal();
    this.plugin.notifySessionsChanged();
  }

  onResize(): void {
    this.fitAddon?.fit();
  }

  applySettings(settings: ShellPluginSettings): void {
    if (!this.terminal) {
      return;
    }
    this.terminal.options = buildTerminalOptions(this.contentEl, settings);
    this.fitAddon?.fit();
  }

  private bindSession(): void {
    if (this.terminal === null) {
      return;
    }
    const existing = this.sessionId !== null ? this.plugin.getSession(this.sessionId) : null;
    const entry = existing ?? this.plugin.createSession(this.terminal.cols, this.terminal.rows);
    this.sessionCreatedByThisView = existing === null;
    this.sessionId = entry.id;
    this.label = entry.label;
    entry.session.attach((data) => this.terminal?.write(data));
    this.session = entry.session;
    this.refreshTabTitle();
    this.plugin.notifySessionsChanged();
  }

  focusTerminal(): void {
    // Unconditional focus for user-initiated paths (open, switch, restart).
    // Workspace restore still goes through focusTerminalIfActive so startup
    // doesn't steal focus.
    requestAnimationFrame(() => this.terminal?.focus());
  }

  private focusTerminalIfActive(): void {
    // Only steal focus when this view is already the active one. On startup
    // Obsidian re-opens every view, and yanking focus out of the active
    // pane the user is working in would be disruptive.
    if (this.app.workspace.getActiveViewOfType(ShellView) !== this) {
      return;
    }
    this.focusTerminal();
  }

  private reserveStatusBarSpace(): void {
    // Obsidian's app status bar is a position: absolute overlay pinned to
    // the bottom-right of the window, not a layout sibling of the workspace
    // splits. A terminal rendering edge-to-edge hides its bottom row under
    // the overlay. FitAddon's measurement only subtracts padding on the
    // .xterm element, so CSS-only fixes either overshoot or leave a gap.
    // Measure the overlay at runtime and shrink the content element so its
    // bottom sits at the overlay's top edge. FitAddon then reads an
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
    // ItemView doesn't expose a public way to reflect getDisplayText changes,
    // but the tab header exposes the title element on the leaf. Fall back to
    // requestSaveLayout if the element isn't available yet (pre-mount).
    const header = (this.leaf as { tabHeaderInnerTitleEl?: HTMLElement }).tabHeaderInnerTitleEl;
    if (header) {
      header.setText(this.label);
      return;
    }
    this.app.workspace.requestSaveLayout();
  }
}
