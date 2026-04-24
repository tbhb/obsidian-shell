import process from 'node:process';
import * as nodePty from 'node-pty';
import { __obsidianShellSetNativeDir as setNativePtyDir } from 'node-pty/lib/utils';
import type { Plugin } from 'obsidian';

// node-pty's wrapper lives in main.js (Vite bundles it). Build-time patches in
// `vite.config.ts` defer its module-level code path that resolves the native
// binary, so the plugin can hand in the folder at runtime before the first
// `spawn` or open call. Everything below routes through initNative(plugin).

let nativeInitialized = false;

function initNative(plugin: Plugin): void {
  if (nativeInitialized) return;
  setNativePtyDir(getPluginDir(plugin));
  nativeInitialized = true;
}

function getPluginDir(plugin: Plugin): string {
  const adapter = plugin.app.vault['adapter'];
  if (typeof adapter.getFullPath !== 'function') {
    throw new Error('obsidian-shell requires a filesystem vault');
  }
  const relDir = plugin.manifest.dir ?? `.obsidian/plugins/${plugin.manifest.id}`;
  return adapter.getFullPath(relDir);
}

function getVaultPath(plugin: Plugin): string {
  const adapter = plugin.app.vault['adapter'];
  if (typeof adapter.getBasePath !== 'function') {
    throw new Error('obsidian-shell requires a filesystem vault');
  }
  return adapter.getBasePath();
}

interface PtySessionOptions {
  shell?: string;
  shellArgs?: string[];
  cwd?: string;
  env?: { [key: string]: string };
  cols?: number;
  rows?: number;
}

// Cap buffered output so a detached session doesn't grow without bound.
// ~200 KB is roughly 2,500 lines of 80-column output, plenty to reorient
// the user on reattach without leaking memory.
const MAX_BUFFER_BYTES = 200_000;

type PtyDataWriter = (data: string) => void;

export class PtySession {
  private proc: nodePty.IPty;
  private buffer = '';
  private writer: PtyDataWriter | null = null;
  private dead = false;
  private exitHandler: (() => void) | null = null;

  constructor(plugin: Plugin, options: PtySessionOptions = {}) {
    initNative(plugin);
    const shell = options.shell ?? process.env['SHELL'] ?? '/bin/zsh';
    // Spawn as a login shell so /etc/zprofile (or /etc/profile for bash) runs
    // `path_helper` on macOS and adds /opt/homebrew/bin, /usr/local/bin, etc.
    // Obsidian's renderer inherits a minimal PATH. Without -l the user's
    // .zshrc fails to locate tools like mise and starship.
    const shellArgs = options.shellArgs ?? ['-l'];
    const cwd = options.cwd ?? getVaultPath(plugin);
    this.proc = nodePty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd,
      env: options.env ?? (process.env as { [key: string]: string }),
    });
    this.proc.onData((data) => {
      this.route(data);
    });
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
  initNative(plugin);
  return new Promise<string>((resolve, reject) => {
    const proc = nodePty.spawn('/usr/bin/uname', ['-a'], {
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
