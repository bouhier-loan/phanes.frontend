import type { FileSource } from '@phanes/renpy-formats';

/**
 * A file of arbitrary size that only exists where data was placed; the rest
 * reads as zeros. Records every read so tests can prove that large files are
 * never loaded whole.
 */
export class VirtualFileSource implements FileSource {
  readonly reads: [number, number][] = [];
  private readonly blocks: { offset: number; bytes: Uint8Array }[] = [];

  constructor(
    readonly path: string,
    readonly size: number,
  ) {}

  place(offset: number, bytes: Uint8Array): this {
    if (offset < 0 || offset + bytes.length > this.size) throw new RangeError('block outside file');
    this.blocks.push({ offset, bytes });
    return this;
  }

  get bytesRead(): number {
    return this.reads.reduce((sum, [s, e]) => sum + (e - s), 0);
  }

  read(start: number, end: number): Promise<Uint8Array> {
    const s = Math.min(Math.max(0, start), this.size);
    const e = Math.min(Math.max(s, end), this.size);
    this.reads.push([s, e]);
    if (e - s > 64 * 1024 * 1024) {
      return Promise.reject(new Error(`refusing a ${e - s} byte read from a virtual file`));
    }
    const out = new Uint8Array(e - s);
    for (const block of this.blocks) {
      const from = Math.max(s, block.offset);
      const to = Math.min(e, block.offset + block.bytes.length);
      if (from < to)
        out.set(block.bytes.subarray(from - block.offset, to - block.offset), from - s);
    }
    return Promise.resolve(out);
  }
}
