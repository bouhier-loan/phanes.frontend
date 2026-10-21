import {
  fromHex,
  openFixture,
  readFixture,
  readFixtureJson,
  toHex,
  VirtualFileSource,
} from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  BytesSource,
  FormatError,
  openRpaEntry,
  readFully,
  readRpaIndex,
  readRpiIndex,
  type RpaIndex,
} from '../../src';

interface Manifest {
  python: string;
  files: Record<string, string>;
  archives: Record<string, { version: string; key: number | null; rpi?: string }>;
  multipart: Record<string, string>;
  bigIndex: { key: number; entries: Record<string, [number, number]> };
}

const dir = ['synthetic', 'rpa'] as const;

async function contents(index: RpaIndex, archiveName: string): Promise<Record<string, string>> {
  const archive = await openFixture(...dir, archiveName);
  const out: Record<string, string> = {};
  for (const entry of index.entries) {
    out[entry.name] = toHex(await readFully(openRpaEntry(archive, entry, entry.name), 1 << 20));
  }
  return out;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof FormatError ? error.code : String(error);
  }
  return undefined;
}

for (const tag of ['py2', 'py3'] as const) {
  const manifest = await readFixtureJson<Manifest>(...dir, `${tag}-manifest.json`);

  describe(`RPA archives written by Python ${manifest.python}`, () => {
    for (const [name, info] of Object.entries(manifest.archives)) {
      it(`${name}: reads the index and every entry`, async () => {
        const archive = await openFixture(...dir, name);
        const index = info.rpi
          ? await readRpiIndex(await openFixture(...dir, info.rpi), archive)
          : await readRpaIndex(archive);
        expect(index.version).toBe(info.version);
        expect(index.key).toBe(info.key);
        expect(index.problems).toEqual([]);
        expect(index.pickleProtocol).toBe(tag === 'py2' ? 2 : info.version === 'RPA-3.0' ? 5 : 2);
        expect(await contents(index, name)).toEqual(manifest.files);
      });
    }

    it('reassembles multi-part entries with prefixes', async () => {
      const name = `${tag}-multipart.rpa`;
      const index = await readRpaIndex(await openFixture(...dir, name));
      expect(await contents(index, name)).toEqual(manifest.multipart);
    });

    it('reads an index past 4 GiB without loading the archive', async () => {
      const index = await readFixture(...dir, `${tag}-big-index.zlib`);
      const size = 6 * 2 ** 30;
      const indexOffset = size - index.length;
      const header = `RPA-3.0 ${indexOffset.toString(16).padStart(16, '0')} ${manifest.bigIndex.key.toString(16)}\n`;
      const file = new VirtualFileSource('huge.rpa', size)
        .place(0, new TextEncoder().encode(header))
        .place(indexOffset, index);
      const result = await readRpaIndex(file);
      const found = Object.fromEntries(
        result.entries.map((e) => {
          const [segment] = e.segments;
          return [e.name, segment?.kind === 'data' ? [segment.offset, segment.length] : null];
        }),
      );
      expect(found).toEqual(manifest.bigIndex.entries);
      expect(file.bytesRead).toBeLessThan(1024 * 1024);
      const far = result.entries.find((e) => e.name === 'far/away.png');
      if (!far) throw new Error('missing entry');
      file.reads.length = 0;
      await openRpaEntry(file, far, far.name).read(0, 16);
      expect(file.reads).toEqual([[5 * 2 ** 30 + 123, 5 * 2 ** 30 + 139]]);
    });

    it('reports out-of-range entries without failing the archive', async () => {
      const index = await readFixture(...dir, `${tag}-big-index.zlib`);
      const size = 2 ** 20;
      const header = `RPA-3.0 ${(size - index.length).toString(16).padStart(16, '0')} 42424242\n`;
      const file = new VirtualFileSource('small.rpa', size)
        .place(0, new TextEncoder().encode(header))
        .place(size - index.length, index);
      const result = await readRpaIndex(file);
      expect(result.entries.map((e) => e.name)).toEqual(['near.rpyc']);
      expect(result.problems.map((p) => p.name).sort()).toEqual(['edge.ogg', 'far/away.png']);
    });
  });
}

describe('RPA errors', () => {
  const v3 = readFixture(...dir, 'py3-v3.rpa');
  const withHeader = async (header: string) => {
    const bytes = (await v3).slice();
    bytes.set(new TextEncoder().encode(header), 0);
    return new BytesSource('x.rpa', bytes);
  };

  it('rejects unknown variants with the header in the details', async () => {
    for (const header of ['RPA-4.0 ', 'RPA-3.2 ', 'ALT-1.0 ', 'PK\u0003\u0004']) {
      const source = await withHeader(header);
      const error = await readRpaIndex(source).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FormatError);
      expect((error as FormatError).code).toBe('RPA_UNKNOWN_HEADER');
      expect(String((error as FormatError).details.header)).toContain(header.slice(0, 2));
    }
  });

  it('rejects malformed headers and index offsets', async () => {
    expect(await codeOf(readRpaIndex(await withHeader('RPA-3.0 zzzzzzzzzzzzzzzz')))).toBe(
      'RPA_BAD_HEADER',
    );
    expect(await codeOf(readRpaIndex(await withHeader('RPA-3.0 ffffffffffffffff')))).toBe(
      'RPA_BAD_HEADER',
    );
  });

  it('rejects a corrupted or truncated index', async () => {
    const bytes = (await v3).slice();
    const truncated = new BytesSource('t.rpa', bytes.subarray(0, bytes.length - 20));
    expect(await codeOf(readRpaIndex(truncated))).toBe('ZLIB_INVALID');
    bytes[bytes.length - 30] = (bytes[bytes.length - 30] ?? 0) ^ 0xff;
    const flipped = await codeOf(readRpaIndex(new BytesSource('f.rpa', bytes)));
    expect(flipped).toMatch(/^(ZLIB_INVALID|PICKLE_INVALID|TRUNCATED|RPA_BAD_INDEX)$/);
  });

  it('rejects an index that is not a dict', async () => {
    const { zlibSync } = await import('fflate');
    const pickle = fromHex('80024e2e'); // None
    const compressed = zlibSync(pickle);
    const header = new TextEncoder().encode(`RPA-2.0 ${(25).toString(16).padStart(16, '0')}\n`);
    const bytes = new Uint8Array(25 + compressed.length);
    bytes.set(header, 0);
    bytes.set(compressed, 25);
    expect(await codeOf(readRpaIndex(new BytesSource('n.rpa', bytes)))).toBe('RPA_BAD_INDEX');
  });
});
