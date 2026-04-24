import { vi } from 'vitest';

export interface FakePtySession {
  isDead: boolean;
  kill: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
}

export function ptyMockFactory(options: { killMarksDead?: boolean } = {}) {
  const { killMarksDead = false } = options;
  const ctor = vi.fn(function ctorImpl(this: FakePtySession) {
    this.isDead = false;
    this.kill = killMarksDead
      ? vi.fn(() => {
          this.isDead = true;
        })
      : vi.fn();
    this.resize = vi.fn();
    this.attach = vi.fn();
    this.detach = vi.fn();
    this.write = vi.fn();
    this.onExit = vi.fn();
  });
  return {
    probePty: vi.fn(),
    PtySession: ctor,
  };
}

export function viewMockFactory() {
  return {
    SHELL_VIEW_TYPE: 'obsidian-shell',
    ShellView: class {
      constructor(
        public leaf: unknown,
        public plugin: unknown,
      ) {}
      applySettings = vi.fn();
      reattachSession = vi.fn();
      attachToSession = vi.fn();
      focusTerminal = vi.fn();
      getSessionId = vi.fn(() => null as string | null);
    },
  };
}
