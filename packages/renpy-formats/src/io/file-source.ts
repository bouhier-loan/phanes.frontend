import { FormatError } from '../errors';

/**
 * Port for random access to a file of any size. Implementations read lazily:
 * a browser File, an entry inside an RPA archive, a file on disk (tests)...
 */
export interface FileSource {
  /** POSIX-style path, relative to the root the user provided. */
  readonly path: string;
  readonly size: number;
  /**
   * Reads bytes in [start, end). The range is clamped to [0, size], so the
   * result can be shorter than requested only at the end of the file.
   */
  read(start: number, end: number): Promise<Uint8Array>;
}

export function clampRange(size: number, start: number, end: number): [number, number] {
  const s = Math.min(Math.max(0, start), size);
  const e = Math.min(Math.max(s, end), size);
  return [s, e];
}

/** A file held in memory. */
export class BytesSource implements FileSource {
  constructor(
    readonly path: string,
    private readonly bytes: Uint8Array,
  ) {}

  get size(): number {
    return this.bytes.length;
  }

  read(start: number, end: number): Promise<Uint8Array> {
    const [s, e] = clampRange(this.bytes.length, start, end);
    return Promise.resolve(this.bytes.subarray(s, e));
  }
}

/** A window [offset, offset + length) of another source. */
export class SliceSource implements FileSource {
  constructor(
    readonly path: string,
    private readonly parent: FileSource,
    private readonly offset: number,
    readonly size: number,
  ) {
    if (offset < 0 || size < 0 || offset + size > parent.size) {
      throw new RangeError(`slice [${offset}, ${offset + size}) outside ${parent.path}`);
    }
  }

  read(start: number, end: number): Promise<Uint8Array> {
    const [s, e] = clampRange(this.size, start, end);
    return this.parent.read(this.offset + s, this.offset + e);
  }
}

/** Several sources read back to back as one file. */
export class ConcatSource implements FileSource {
  readonly size: number;
  private readonly starts: number[] = [];

  constructor(
    readonly path: string,
    private readonly parts: readonly FileSource[],
  ) {
    let total = 0;
    for (const part of parts) {
      this.starts.push(total);
      total += part.size;
    }
    this.size = total;
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const [s, e] = clampRange(this.size, start, end);
    const out = new Uint8Array(e - s);
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      const partStart = this.starts[i];
      if (part === undefined || partStart === undefined) continue;
      const from = Math.max(s, partStart);
      const to = Math.min(e, partStart + part.size);
      if (from >= to) continue;
      const chunk = await part.read(from - partStart, to - partStart);
      out.set(chunk, from - s);
    }
    return out;
  }
}

/**
 * Reads a whole source, refusing anything larger than `maxBytes`. Only for
 * files that must be decoded in full (scripts, indexes), never for assets.
 */
export async function readFully(source: FileSource, maxBytes: number): Promise<Uint8Array> {
  if (source.size > maxBytes) {
    throw new FormatError('TOO_LARGE', `${source.path} is larger than ${maxBytes} bytes`, {
      size: source.size,
      limit: maxBytes,
    });
  }
  let bytes: Uint8Array;
  try {
    bytes = await source.read(0, source.size);
  } catch (cause) {
    throw new FormatError('IO_READ_FAILED', `cannot read ${source.path}`, {}, { cause });
  }
  if (bytes.length !== source.size) {
    throw new FormatError('TRUNCATED', `short read on ${source.path}`, {
      expected: source.size,
      actual: bytes.length,
    });
  }
  return bytes;
}

/** Reads [start, end), wrapping I/O failures in a FormatError. */
export async function readRange(
  source: FileSource,
  start: number,
  end: number,
): Promise<Uint8Array> {
  try {
    return await source.read(start, end);
  } catch (cause) {
    throw new FormatError('IO_READ_FAILED', `cannot read ${source.path}`, {}, { cause });
  }
}
