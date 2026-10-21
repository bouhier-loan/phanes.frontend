import type { FileSource } from '@phanes/renpy-formats';

/** A browser File (or any Blob), read by slices: the file is never loaded whole. */
export class BlobFileSource implements FileSource {
  constructor(
    readonly path: string,
    readonly blob: Blob,
  ) {}

  get size(): number {
    return this.blob.size;
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const s = Math.min(Math.max(0, start), this.blob.size);
    const e = Math.min(Math.max(s, end), this.blob.size);
    return new Uint8Array(await this.blob.slice(s, e).arrayBuffer());
  }
}
