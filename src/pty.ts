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

export function loadNodePty(plugin: Plugin): typeof NodePty {
  const nodePtyPath = path.join(getPluginDir(plugin), 'node_modules', 'node-pty');
  return getElectronRequire()(nodePtyPath) as typeof NodePty;
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
