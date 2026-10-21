import { readFixture } from '@phanes/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BytesSource,
  FormatError,
  readRpaIndex,
  readRpyc,
  toCanonicalJson,
  unpickle,
} from '../src';

/**
 * Damaged inputs must only ever produce a FormatError: never another
 * exception, a hang or a crash.
 */
async function onlyFormatErrors(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof FormatError)) throw error;
  }
}

const mutation = (length: number) =>
  fc.oneof(
    fc.record({ kind: fc.constant('truncate' as const), at: fc.integer({ min: 0, max: length }) }),
    fc.record({
      kind: fc.constant('flip' as const),
      flips: fc.array(
        fc.tuple(fc.integer({ min: 0, max: length - 1 }), fc.integer({ min: 1, max: 255 })),
        {
          minLength: 1,
          maxLength: 8,
        },
      ),
    }),
  );

function mutate(
  bytes: Uint8Array,
  m: { kind: 'truncate'; at: number } | { kind: 'flip'; flips: [number, number][] },
) {
  if (m.kind === 'truncate') return bytes.slice(0, m.at);
  const out = bytes.slice();
  for (const [at, mask] of m.flips) out[at] = (out[at] ?? 0) ^ mask;
  return out;
}

describe('fuzzing', () => {
  it('readRpyc survives truncation and bit flips', async () => {
    for (const sdk of ['7.4.11', '8.5.3']) {
      const bytes = await readFixture(
        'build',
        sdk,
        'phanes_demo',
        'project',
        'game',
        'script.rpyc',
      );
      await fc.assert(
        fc.asyncProperty(mutation(bytes.length), async (m) => {
          await onlyFormatErrors(async () => {
            const script = await readRpyc(new BytesSource('f.rpyc', mutate(bytes, m)));
            return toCanonicalJson(script.stmts[0] ?? null);
          });
        }),
        { numRuns: 300, seed: 42 },
      );
    }
  });

  it('readRpaIndex survives truncation and bit flips', async () => {
    for (const sdk of ['6.99.14.3', '8.5.3']) {
      const bytes = await readFixture('build', sdk, 'phanes_demo', 'dist', 'game', 'scripts.rpa');
      await fc.assert(
        fc.asyncProperty(mutation(bytes.length), async (m) => {
          await onlyFormatErrors(() => readRpaIndex(new BytesSource('f.rpa', mutate(bytes, m))));
        }),
        { numRuns: 300, seed: 7 },
      );
    }
  });

  it('unpickle survives arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        try {
          unpickle(Uint8Array.of(0x80, 2, ...bytes));
        } catch (error) {
          expect(error).toBeInstanceOf(FormatError);
        }
      }),
      { numRuns: 2000, seed: 1 },
    );
  });
});
