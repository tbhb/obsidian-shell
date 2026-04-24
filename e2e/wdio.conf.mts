import { homedir } from 'node:os';
import path from 'node:path';

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'obsidian',
      browserVersion: 'latest',
      'wdio:obsidianOptions': {
        // Pin the installer (Electron binary) to latest so it matches the
        // Electron 39 headers node-pty was rebuilt against. "earliest"
        // picks the oldest installer compatible with minAppVersion, which
        // ships a different Electron ABI than our rebuild.
        installerVersion: 'latest',
        // Install the plugin from the repo root but start it disabled. The
        // spec stages native binaries into the plugin folder before enabling
        // the plugin so node-pty's native path is resolvable at load time.
        plugins: [{ path: '..', enabled: false }],
        vault: './vaults/self-test',
      },
    },
  ],
  services: ['obsidian'],
  reporters: ['obsidian'],
  cacheDir: path.join(homedir(), '.cache', 'shell-e2e', 'wdio'),
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  logLevel: 'warn',
  waitforTimeout: 15000,
};
