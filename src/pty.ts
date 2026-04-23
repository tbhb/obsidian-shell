import path from 'node:path';
import process from 'node:process';
import type * as NodePty from 'node-pty';
import type { FileSystemAdapter, Plugin } from 'obsidian';

// Electron's require bypasses Vite's bundler and loads CommonJS modules from
// the real filesystem. Static `import 'node-pty'` would pull the module into
// the bundle, which breaks because node-pty's native binary cannot be bundled
// and because the compiled binary lives outside the bundled main.js at runtime.
type ElectronRequire = (id: string) => unknown;

function getElectronRequire(): ElectronRequire {
  const win = window as typeof globalThis & { require?: ElectronRequire };
  if (typeof win.require !== 'function') {
    throw new Error('obsidian-terminal requires desktop Obsidian (window.require unavailable)');
  }
  return win.require;
}

function getPluginDir(plugin: Plugin): string {
  const adapter = plugin.app.vault.adapter as FileSystemAdapter;
  if (typeof adapter.getFullPath !== 'function') {
    throw new Error('obsidian-terminal requires a filesystem vault');
  }
  const relDir = plugin.manifest.dir ?? `.obsidian/plugins/${plugin.manifest.id}`;
  return adapter.getFullPath(relDir);
}

function getVaultPath(plugin: Plugin): string {
  const adapter = plugin.app.vault.adapter as FileSystemAdapter;
  if (typeof adapter.getBasePath !== 'function') {
    throw new Error('obsidian-terminal requires a filesystem vault');
  }
  return adapter.getBasePath();
}

export function loadNodePty(plugin: Plugin): typeof NodePty {
  const nodePtyPath = path.join(getPluginDir(plugin), 'node_modules', 'node-pty');
  return getElectronRequire()(nodePtyPath) as typeof NodePty;
}

export interface PtySessionOptions {
  shell?: string;
  shellArgs?: string[];
  cwd?: string;
  env?: { [key: string]: string };
  cols?: number;
  rows?: number;
}

// Cap buffered output so a detached session does not grow without bound.
// ~200 KB is roughly 2,500 lines of 80-column output, plenty to reorient
// the user on reattach without leaking memory.
const MAX_BUFFER_BYTES = 200_000;

export type PtyDataWriter = (data: string) => void;

export class PtySession {
  private proc: NodePty.IPty;
  private buffer = '';
  private writer: PtyDataWriter | null = null;
  private dead = false;
  private exitHandler: (() => void) | null = null;

  constructor(plugin: Plugin, options: PtySessionOptions = {}) {
    const pty = loadNodePty(plugin);
    const shell = options.shell ?? process.env.SHELL ?? '/bin/zsh';
    // Spawn as a login shell so /etc/zprofile (or /etc/profile for bash) runs
    // path_helper on macOS and adds /opt/homebrew/bin, /usr/local/bin, etc.
    // Obsidian's renderer inherits a minimal PATH; without -l the user's
    // .zshrc fails to locate tools like mise and starship.
    const shellArgs = options.shellArgs ?? ['-l'];
    const cwd = options.cwd ?? getVaultPath(plugin);
    this.proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd,
      env: options.env ?? (process.env as { [key: string]: string }),
    });
    this.proc.onData((data) => this.route(data));
    this.proc.onExit(() => {
      this.dead = true;
      this.route('\r\n[process exited]\r\n');
      this.exitHandler?.();
    });
  }

  get isDead(): boolean {
    return this.dead;
  }

  onExit(cb: () => void): void {
    this.exitHandler = cb;
  }

  attach(writer: PtyDataWriter): void {
    this.writer = writer;
    if (this.buffer) {
      writer(this.buffer);
      this.buffer = '';
    }
  }

  detach(): void {
    this.writer = null;
  }

  write(data: string): void {
    if (this.dead) return;
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.dead) return;
    this.proc.resize(cols, rows);
  }

  kill(): void {
    if (this.dead) return;
    this.proc.kill();
  }

  private route(data: string): void {
    if (this.writer) {
      this.writer(data);
      return;
    }
    this.buffer += data;
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_BYTES);
    }
  }
}

export async function probePty(plugin: Plugin): Promise<string> {
  const pty = loadNodePty(plugin);
  return new Promise<string>((resolve, reject) => {
    const proc = pty.spawn('/usr/bin/uname', ['-a'], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: getPluginDir(plugin),
      env: process.env as { [key: string]: string },
    });
    let output = '';
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('PTY probe timed out after 5s'));
    }, 5000);
    proc.onData((data) => {
      output += data;
    });
    proc.onExit(() => {
      clearTimeout(timeout);
      resolve(output.trim());
    });
  });
}
