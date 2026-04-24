// The rollup transform in `vite.config.ts` appends __obsidianShellSetNativeDir
// to node-pty/lib/utils so main.ts can hand the plugin folder to node-pty
// before it loads the platform-specific .node binary.
declare module 'node-pty/lib/utils' {
  export function __obsidianShellSetNativeDir(dir: string): void;
}
