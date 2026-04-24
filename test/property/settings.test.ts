import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, type ShellPluginSettings } from '../../src/settings';

// Arbitrary for a stored-settings blob. Every group and every key inside
// a group is optional (`requiredKeys: []`), matching what Obsidian hands
// back from `loadData()` when a prior version wrote a subset of fields.
const shellArb = fc.record(
  {
    path: fc.string(),
    args: fc.array(fc.string()),
  },
  { requiredKeys: [] },
);

const cwdArb = fc.record(
  {
    strategy: fc.constantFrom('vault-root', 'note-dir', 'fixed-path'),
    fixedPath: fc.string(),
  },
  { requiredKeys: [] },
);

const appearanceArb = fc.record(
  {
    fontFamily: fc.string(),
    fontSize: fc.integer(),
    lineHeight: fc.double({ noNaN: true }),
    cursorStyle: fc.constantFrom('block', 'bar', 'underline'),
    cursorBlink: fc.boolean(),
    followObsidianTheme: fc.boolean(),
  },
  { requiredKeys: [] },
);

const behaviorArb = fc.record(
  {
    scrollback: fc.integer(),
    copyOnSelection: fc.boolean(),
  },
  { requiredKeys: [] },
);

const storedSettings = fc.record(
  {
    shell: shellArb,
    cwd: cwdArb,
    appearance: appearanceArb,
    behavior: behaviorArb,
  },
  { requiredKeys: [] },
);

const groups = Object.keys(DEFAULT_SETTINGS) as (keyof ShellPluginSettings)[];

describe('mergeSettings (property)', () => {
  test.prop([storedSettings])('fills every default group', (stored) => {
    const merged = mergeSettings(stored);
    for (const group of groups) {
      expect(merged).toHaveProperty(group);
    }
  });

  test.prop([storedSettings])('keeps every explicitly stored value', (stored) => {
    const merged = mergeSettings(stored);
    expect(merged).toMatchObject(stored);
  });

  test.prop([storedSettings])('falls back to defaults for absent keys', (stored) => {
    const merged = mergeSettings(stored);
    for (const group of groups) {
      const innerDefault = DEFAULT_SETTINGS[group] as Record<string, unknown>;
      const innerStored = (stored[group] ?? {}) as Record<string, unknown>;
      const innerMerged = merged[group] as Record<string, unknown>;
      for (const key of Object.keys(innerDefault)) {
        if (!(key in innerStored)) {
          expect(innerMerged[key]).toStrictEqual(innerDefault[key]);
        }
      }
    }
  });

  test.prop([storedSettings])('is idempotent', (stored) => {
    const once = mergeSettings(stored);
    const twice = mergeSettings(once);
    expect(twice).toStrictEqual(once);
  });

  test.prop([storedSettings])('does not mutate the input', (stored) => {
    const snapshot = structuredClone(stored);
    mergeSettings(stored);
    // toEqual, not toStrictEqual: fc.record generates null-prototype
    // objects whose structuredClone copy has Object.prototype. Prototype
    // identity isn't what this property checks. Own enumerable values are.
    expect(stored).toEqual(snapshot);
  });

  test.prop([storedSettings])('does not mutate DEFAULT_SETTINGS', (stored) => {
    const snapshot = structuredClone(DEFAULT_SETTINGS);
    mergeSettings(stored);
    expect(DEFAULT_SETTINGS).toEqual(snapshot);
  });

  test.prop([fc.constantFrom(null, undefined, {})])(
    'returns defaults for null, undefined, or empty input',
    (stored) => {
      expect(mergeSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
    },
  );
});
