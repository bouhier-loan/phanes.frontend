import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fixturePath, NodeFileSource } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  type FileSource,
  openRpaEntry,
  readRpaIndex,
  readRpycPayload,
  toCanonicalJson,
} from '../../src';

/**
 * Compares our unpickler and canonical dump with tools/oracle/dump_json.py,
 * which decodes the same scripts with CPython's own unpickler.
 */
/** Fixture games, the SDKs that build them, and their compiled scripts (project + dist). */
const GAMES = [
  { game: 'phanes_demo', sdks: ['6.99.14.3', '7.4.11', '8.3.7', '8.5.3'], scripts: 12 },
  // layeredimage exists since Ren'Py 7.
  { game: 'phanes_layers', sdks: ['7.4.11', '8.3.7', '8.5.3'], scripts: 4 },
] as const;

interface OracleDump {
  slot: number;
  protocol: number;
  payload: unknown;
}

async function listJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.json'))
      out.push(join(entry.parentPath, entry.name));
  }
  return out.sort();
}

async function openScript(buildDir: string, rel: string): Promise<FileSource> {
  const archiveAt = rel.indexOf('.rpa/');
  if (archiveAt < 0) return NodeFileSource.open(join(buildDir, rel), rel);
  const archivePath = rel.slice(0, archiveAt + 4);
  const entryName = rel.slice(archiveAt + 5);
  const archive = await NodeFileSource.open(join(buildDir, archivePath), archivePath);
  const index = await readRpaIndex(archive);
  const entry = index.entries.find((e) => e.name === entryName);
  if (!entry) throw new Error(`${entryName} not in ${archivePath}`);
  return openRpaEntry(archive, entry, rel);
}

for (const { game, sdks, scripts } of GAMES)
  for (const sdk of sdks) {
    const expectedDir = fixturePath('expected', sdk, game, 'canonical');
    const buildDir = fixturePath('build', sdk, game);
    const files = await listJson(expectedDir);

    describe(`${game} scripts compiled by Ren'Py ${sdk} match CPython's unpickler`, () => {
      it('has oracle dumps', () => {
        expect(files.length).toBe(scripts);
      });

      for (const file of files) {
        const rel = relative(expectedDir, file)
          .replace(/\.json$/, '')
          .split('\\')
          .join('/');
        it(rel, async () => {
          const expected = JSON.parse(await readFile(file, 'utf8')) as OracleDump;
          const payload = await readRpycPayload(await openScript(buildDir, rel));
          expect(payload.slot).toBe(expected.slot);
          expect(payload.pickleProtocol).toBe(expected.protocol);
          expect(payload.warnings).toEqual([]);
          // Round-trip through JSON text, like the oracle's output.
          const actual = JSON.parse(JSON.stringify(toCanonicalJson(payload.value))) as unknown;
          expect(actual).toEqual(expected.payload);
        });
      }
    });
  }
