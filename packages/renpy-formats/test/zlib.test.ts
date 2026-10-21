import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError, inflateZlib, looksLikeZlib } from '../src';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof FormatError ? error.code : String(error);
  }
  return undefined;
}

describe('inflateZlib', () => {
  const data = new TextEncoder().encode('Ren\u2019Py '.repeat(10_000));
  const compressed = zlibSync(data);

  it('round-trips', () => {
    expect(inflateZlib(compressed, { maxOutput: 1 << 20 })).toEqual(data);
  });

  it('enforces the output limit', () => {
    expect(code(() => inflateZlib(compressed, { maxOutput: 1000 }))).toBe('ZLIB_LIMIT');
  });

  it('stops a compression bomb early', () => {
    const bomb = zlibSync(new Uint8Array(64 * 1024 * 1024));
    expect(code(() => inflateZlib(bomb, { maxOutput: 1024 * 1024 }))).toBe('ZLIB_LIMIT');
  });

  it('rejects truncated and invalid data', () => {
    expect(code(() => inflateZlib(compressed.subarray(0, 100), { maxOutput: 1 << 20 }))).toBe(
      'ZLIB_INVALID',
    );
    expect(code(() => inflateZlib(Uint8Array.of(1, 2, 3, 4), { maxOutput: 100 }))).toBe(
      'ZLIB_INVALID',
    );
    expect(code(() => inflateZlib(new Uint8Array(0), { maxOutput: 100 }))).toBe('ZLIB_INVALID');
  });

  it('recognizes zlib headers', () => {
    expect(looksLikeZlib(0x78, 0x9c)).toBe(true);
    expect(looksLikeZlib(0x78, 0xda)).toBe(true);
    expect(looksLikeZlib(0x52, 0x50)).toBe(false);
  });
});
