import { vi } from 'vitest';

import '../setup-dom';

// Integration tests drive the real `ShellPlugin` constructor, which imports
// `src/view` (xterm + canvas) and `src/pty` (node-pty native binary)
// transitively. Neither is reachable from jsdom. Stub both at the project
// level so every integration test file resolves them to safe mocks.
vi.mock('../../src/pty', async () => (await import('../helpers/mocks')).ptyMockFactory());
vi.mock('../../src/view', async () => (await import('../helpers/mocks')).viewMockFactory());
