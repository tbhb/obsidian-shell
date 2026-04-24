import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { detectMonospaceFonts } from '../../src/settings';

const makeFontFaceSet = (predicate: (spec: string) => boolean): FontFaceSet =>
  ({ check: predicate }) as unknown as FontFaceSet;

// The candidate list is private to `src/settings.ts`. Rebuild it here
// by running the detector through an always-true predicate, so the other
// properties can compare against a known baseline.
const candidates = detectMonospaceFonts(makeFontFaceSet(() => true));

describe('detectMonospaceFonts (property)', () => {
  test.prop([fc.func(fc.boolean())])(
    'returns an ordered subset of the candidate list',
    (pred: (...args: unknown[]) => boolean) => {
      const result = detectMonospaceFonts(makeFontFaceSet(pred));
      let cursor = 0;
      for (const font of result) {
        const next = candidates.indexOf(font, cursor);
        expect(next).not.toBe(-1);
        cursor = next + 1;
      }
    },
  );

  test.prop([fc.func(fc.boolean())])(
    'equals the subset of candidates for which check returns true',
    (pred: (...args: unknown[]) => boolean) => {
      const result = detectMonospaceFonts(makeFontFaceSet(pred));
      const expected = candidates.filter((font) => pred(`12px "${font}"`));
      expect(result).toStrictEqual(expected);
    },
  );

  test.prop([fc.constantFrom(null, undefined, {}, { check: 'not-a-function' })])(
    'returns [] for null, undefined, or a non-function check',
    (input) => {
      expect(detectMonospaceFonts(input as FontFaceSet | null | undefined)).toStrictEqual([]);
    },
  );
});
