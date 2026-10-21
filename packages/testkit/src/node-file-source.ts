import { open, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { FileSource } from '@phanes/renpy-formats';

/** A file on disk, read by slices. */
export class NodeFileSource implements FileSource {
  constructor(
    readonly path: string,
    private readonly diskPath: string,
    readonly size: number,
  ) {}

  static async open(diskPath: string, path: string = diskPath): Promise<NodeFileSource> {
    const info = await stat(diskPath);
    return new NodeFileSource(path, diskPath, info.size);
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const s = Math.min(Math.max(0, start), this.size);
    const e = Math.min(Math.max(s, end), this.size);
    const buffer = new Uint8Array(e - s);
    if (buffer.length === 0) return buffer;
    const handle = await open(this.diskPath, 'r');
    try {
      let done = 0;
      while (done < buffer.length) {
        const { bytesRead } = await handle.read(buffer, done, buffer.length - done, s + done);
        if (bytesRead === 0) break;
        done += bytesRead;
      }
      return done === buffer.length ? buffer : buffer.subarray(0, done);
    } finally {
      await handle.close();
    }
  }
}

/**
 * Lists every file under `root` as FileSources whose paths are relative to
 * the parent of `root`, like a browser folder drop (`root/game/...`).
 */
export async function walkDirectory(
  root: string,
  base: string = join(root, '..'),
): Promise<FileSource[]> {
  const out: FileSource[] = [];
  const visit = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        out.push(await NodeFileSource.open(full, relative(base, full).split(sep).join('/')));
      }
    }
  };
  await visit(root);
  return out;
}
