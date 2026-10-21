import { Unzlib } from 'fflate';
import { FormatError } from '../errors';

/** Input is fed in slices this big, so the output limit is checked often. */
const INPUT_SLICE = 16 * 1024;

export interface InflateOptions {
  /** Maximum decompressed size, in bytes. */
  readonly maxOutput: number;
}

/**
 * Decompresses a zlib (RFC 1950) stream, as Python's `zlib.decompress`.
 * Uses fflate's synchronous streaming API only: its async API spawns workers
 * from blob: URLs, which the CSP forbids.
 */
export function inflateZlib(input: Uint8Array, options: InflateOptions): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Set from the callback; an object keeps the flow analysis honest.
  const state = { done: false };
  const stream = new Unzlib((chunk, final) => {
    total += chunk.length;
    if (total > options.maxOutput) {
      throw new FormatError('ZLIB_LIMIT', `decompressed data exceeds ${options.maxOutput} bytes`, {
        limit: options.maxOutput,
      });
    }
    chunks.push(chunk);
    if (final) state.done = true;
  });
  try {
    if (input.length === 0) stream.push(input, true);
    for (let i = 0; i < input.length; i += INPUT_SLICE) {
      const end = Math.min(input.length, i + INPUT_SLICE);
      stream.push(input.subarray(i, end), end === input.length);
      if (state.done) break;
    }
  } catch (error) {
    if (error instanceof FormatError) throw error;
    throw new FormatError(
      'ZLIB_INVALID',
      `invalid zlib data: ${String(error)}`,
      {},
      { cause: error },
    );
  }
  if (!state.done) throw new FormatError('ZLIB_INVALID', 'zlib stream is truncated');
  if (chunks.length === 1 && chunks[0]) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** True if the two bytes look like a zlib header (CMF/FLG check). */
export function looksLikeZlib(b0: number, b1: number): boolean {
  return (b0 & 0x0f) === 8 && b0 >> 4 <= 7 && ((b0 << 8) | b1) % 31 === 0;
}
